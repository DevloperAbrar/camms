const { parse } = require('csv-parse/sync');
const { prisma } = require('../config/db');
const httpError = require('../utils/httpError');
const cal = require('./calendar.service');
const { STARTER_TEMPLATES } = require('../data/syllabusStarterTemplates');

const STALE_DAYS = 14; // no update for this long while chapters are pending = "stale"

const DAY_MS = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;
const diffDays = (a, b) => Math.round((cal.toDate(b).getTime() - cal.toDate(a).getTime()) / DAY_MS);
const weightOf = (ch) => Math.max(1, Number(ch.plannedPeriods) || 1);
const dateOrNull = (s) => (s ? cal.toDate(s) : null);
const ymdOrNull = (d) => (d ? cal.ymd(d) : null);

// "Today" in the school's own timezone, as YYYY-MM-DD
async function getToday(schoolId) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: (school && school.timezone) || 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return cal.ymd(new Date());
  }
}

// ---------------------------------------------------------------- progress maths
// Keeps status and percent consistent: completed = 100, not_started = 0, in_progress = 1..99
function normaliseProgress({ status, percentDone }) {
  const hasPct = Number.isFinite(percentDone);
  const pct = hasPct ? Math.max(0, Math.min(100, Math.round(percentDone))) : null;
  const st = status || (pct === 0 ? 'not_started' : pct === 100 ? 'completed' : 'in_progress');
  if (st === 'completed') return { status: 'completed', percentDone: 100 };
  if (st === 'not_started') return { status: 'not_started', percentDone: 0 };
  return { status: 'in_progress', percentDone: pct === null ? 50 : Math.min(99, Math.max(1, pct)) };
}

// How much of a chapter SHOULD be done by `today`, going by its planned dates (0..1), or null if unplanned
function expectedFraction(ch, today) {
  const s = ymdOrNull(ch.plannedStart);
  const e = ymdOrNull(ch.plannedEnd);
  if (!s || !e) return null;
  if (today > e) return 1;
  if (today < s) return 0;
  return Math.min(1, (diffDays(s, today) + 1) / (diffDays(s, e) + 1));
}

function paceOf(lagPct) {
  if (lagPct === null || lagPct === undefined) return 'no_plan';
  if (lagPct <= -5) return 'ahead';
  if (lagPct < 5) return 'on_track';
  if (lagPct < 15) return 'slightly_behind';
  return 'behind';
}

function examRisk(coveragePct, daysLeft) {
  if (coveragePct >= 99.5) return 'ready';
  if (daysLeft === null || daysLeft === undefined) return coveragePct < 40 ? 'watch' : 'ok';
  if (daysLeft <= 14) return coveragePct < 80 ? 'high' : coveragePct < 95 ? 'watch' : 'ok';
  if (daysLeft <= 30) return coveragePct < 60 ? 'high' : coveragePct < 80 ? 'watch' : 'ok';
  return 'ok';
}

// chapters: SyllabusChapter rows, getProgress(chapterId) -> progress row | undefined
function summarise(chapters, getProgress, today, { withPending = false } = {}) {
  let totalW = 0; let doneW = 0; let planW = 0; let planDoneW = 0; let planExpW = 0;
  let completed = 0; let inProgress = 0; let lastUpdated = null;
  const pending = [];

  for (const ch of chapters) {
    const p = getProgress(ch.id);
    const pct = p ? p.percentDone : 0;
    const w = weightOf(ch);
    totalW += w;
    doneW += (w * pct) / 100;

    if (pct >= 100) completed += 1;
    else {
      if (pct > 0) inProgress += 1;
      if (withPending) pending.push({ id: ch.id, title: ch.title, unitName: ch.unitName, percentDone: pct, plannedPeriods: ch.plannedPeriods });
    }

    const ef = expectedFraction(ch, today);
    if (ef !== null) {
      planW += w;
      planDoneW += (w * pct) / 100;
      planExpW += w * ef;
    }
    if (p && p.updatedAt && (!lastUpdated || p.updatedAt > lastUpdated)) lastUpdated = p.updatedAt;
  }

  const coveragePct = totalW ? round1((doneW / totalW) * 100) : 0;
  const expectedPct = planW ? round1((planExpW / planW) * 100) : null;
  const lagPct = planW ? round1((planExpW / planW) * 100 - (planDoneW / planW) * 100) : null;
  const daysSinceUpdate = lastUpdated ? Math.max(0, diffDays(cal.ymd(lastUpdated), today)) : null;
  const pendingCount = chapters.length - completed;
  const stale = pendingCount > 0 && chapters.length > 0 && (daysSinceUpdate === null || daysSinceUpdate >= STALE_DAYS);

  return {
    totalChapters: chapters.length,
    completedChapters: completed,
    inProgressChapters: inProgress,
    pendingChapters: pendingCount,
    totalWeight: totalW,
    doneWeight: round1(doneW),
    remainingPeriods: Math.max(0, Math.round(totalW - doneW)),
    coveragePct,
    expectedPct,
    lagPct,
    pace: paceOf(lagPct),
    lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
    daysSinceUpdate,
    stale,
    ...(withPending ? { pending } : {}),
  };
}

// ---------------------------------------------------------------- loading helpers
async function loadStructure({ schoolId, sessionId, classId = null }) {
  return prisma.class.findMany({
    where: { schoolId, sessionId, ...(classId ? { id: classId } : {}) },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      sections: { select: { id: true, name: true, classTeacherId: true }, orderBy: { name: 'asc' } },
      subjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
    },
  });
}

function allCombos(classes) {
  const combos = [];
  for (const c of classes) {
    for (const sec of c.sections) {
      for (const sub of c.subjects) {
        combos.push({ classId: c.id, className: c.name, sectionId: sec.id, sectionName: sec.name, subjectId: sub.id, subjectName: sub.name });
      }
    }
  }
  return combos;
}

async function teacherMap(schoolId, sessionId) {
  const rows = await prisma.facultyAssignment.findMany({
    where: { sessionId, isActive: true, faculty: { schoolId } },
    select: { sectionId: true, subjectId: true, faculty: { select: { id: true, name: true } } },
  });
  const map = new Map();
  for (const r of rows) {
    const key = `${r.sectionId}|${r.subjectId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ id: r.faculty.id, name: r.faculty.name });
  }
  return map;
}

// One row per (section x subject): coverage, expected, pace, staleness
async function computeRows({ schoolId, sessionId, combos, today }) {
  if (!combos.length) return [];
  const subjectIds = [...new Set(combos.map((c) => c.subjectId))];
  const sectionIds = [...new Set(combos.map((c) => c.sectionId))];

  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId, sessionId, subjectId: { in: subjectIds } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const chapterIds = chapters.map((c) => c.id);

  const [progress, teachers] = await Promise.all([
    chapterIds.length
      ? prisma.syllabusProgress.findMany({ where: { schoolId, sectionId: { in: sectionIds }, chapterId: { in: chapterIds } } })
      : [],
    teacherMap(schoolId, sessionId),
  ]);

  const bySubject = new Map();
  for (const ch of chapters) {
    if (!bySubject.has(ch.subjectId)) bySubject.set(ch.subjectId, []);
    bySubject.get(ch.subjectId).push(ch);
  }
  const pmap = new Map(progress.map((p) => [`${p.chapterId}|${p.sectionId}`, p]));

  return combos.map((c) => {
    const list = bySubject.get(c.subjectId) || [];
    return {
      ...c,
      teachers: teachers.get(`${c.sectionId}|${c.subjectId}`) || [],
      setUp: list.length > 0,
      ...summarise(list, (id) => pmap.get(`${id}|${c.sectionId}`), today),
    };
  });
}

function overviewSummary(rows) {
  const tracked = rows.filter((r) => r.setUp);
  const sum = tracked.reduce((a, r) => a + r.coveragePct, 0);
  const subjectsNotSetUp = new Set(rows.filter((r) => !r.setUp).map((r) => `${r.classId}|${r.subjectId}`));
  return {
    sectionSubjects: rows.length,
    tracked: tracked.length,
    avgCoveragePct: tracked.length ? round1(sum / tracked.length) : 0,
    behind: tracked.filter((r) => r.pace === 'behind').length,
    slightlyBehind: tracked.filter((r) => r.pace === 'slightly_behind').length,
    onTrackOrAhead: tracked.filter((r) => r.pace === 'on_track' || r.pace === 'ahead').length,
    stale: tracked.filter((r) => r.stale).length,
    subjectsNotSetUp: subjectsNotSetUp.size,
  };
}

// ---------------------------------------------------------------- exam readiness
async function findExamDate({ schoolId, sessionId, examName, classId, today }) {
  const events = await prisma.calendarEvent.findMany({
    where: {
      schoolId,
      sessionId,
      kind: 'exam',
      title: { contains: examName, mode: 'insensitive' },
      OR: [{ classIds: { isEmpty: true } }, { classIds: { has: classId } }],
    },
    orderBy: { startDate: 'asc' },
    select: { title: true, startDate: true, endDate: true },
  });
  const ev = events.find((e) => cal.ymd(e.endDate) >= today) || events[events.length - 1];
  if (!ev) return null;
  const start = cal.ymd(ev.startDate);
  return { title: ev.title, startDate: start, endDate: cal.ymd(ev.endDate), daysLeft: diffDays(today, start) };
}

// allow: optional Set of "sectionId|subjectId" (used to limit what a faculty member can see)
async function buildReadiness({ schoolId, examTypeId, today, sectionIds = null, allow = null }) {
  const examType = await prisma.examType.findFirst({
    where: { id: examTypeId, schoolId },
    include: {
      class: { select: { id: true, name: true, sections: { select: { id: true, name: true }, orderBy: { name: 'asc' } } } },
      examSubjects: { select: { subjectId: true } },
    },
  });
  if (!examType) return null;

  const [scopes, subjects, teachers, examDate] = await Promise.all([
    prisma.syllabusExamScope.findMany({ where: { schoolId, examTypeId }, include: { chapter: true } }),
    prisma.subject.findMany({ where: { schoolId, classId: examType.classId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    teacherMap(schoolId, examType.sessionId),
    findExamDate({ schoolId, sessionId: examType.sessionId, examName: examType.name, classId: examType.classId, today }),
  ]);

  const scoped = new Map();
  for (const s of scopes) {
    if (!scoped.has(s.chapter.subjectId)) scoped.set(s.chapter.subjectId, []);
    scoped.get(s.chapter.subjectId).push(s.chapter);
  }
  for (const list of scoped.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const chapterIds = scopes.map((s) => s.chapterId);
  const sections = examType.class.sections.filter((s) => !sectionIds || sectionIds.includes(s.id));
  const progress = chapterIds.length && sections.length
    ? await prisma.syllabusProgress.findMany({ where: { schoolId, chapterId: { in: chapterIds }, sectionId: { in: sections.map((s) => s.id) } } })
    : [];
  const pmap = new Map(progress.map((p) => [`${p.chapterId}|${p.sectionId}`, p]));

  const daysLeft = examDate ? examDate.daysLeft : null;
  const rows = [];
  for (const sec of sections) {
    for (const sub of subjects) {
      const list = scoped.get(sub.id);
      if (!list || !list.length) continue;
      if (allow && !allow.has(`${sec.id}|${sub.id}`)) continue;
      const s = summarise(list, (id) => pmap.get(`${id}|${sec.id}`), today, { withPending: true });
      rows.push({
        sectionId: sec.id,
        sectionName: sec.name,
        subjectId: sub.id,
        subjectName: sub.name,
        teachers: teachers.get(`${sec.id}|${sub.id}`) || [],
        ...s,
        risk: examRisk(s.coveragePct, daysLeft),
      });
    }
  }

  const totalW = rows.reduce((a, r) => a + r.totalWeight, 0);
  const doneW = rows.reduce((a, r) => a + r.doneWeight, 0);
  const examSubjectIds = new Set(examType.examSubjects.map((e) => e.subjectId));
  const subjectsWithoutScope = subjects.filter((s) => examSubjectIds.has(s.id) && !scoped.has(s.id)).map((s) => s.name);

  return {
    exam: { id: examType.id, name: examType.name, classId: examType.classId, className: examType.class.name, sessionId: examType.sessionId },
    examDate,
    scopeDefined: scoped.size > 0,
    subjectsWithoutScope,
    rows,
    summary: {
      coveragePct: totalW ? round1((doneW / totalW) * 100) : 0,
      high: rows.filter((r) => r.risk === 'high').length,
      watch: rows.filter((r) => r.risk === 'watch').length,
      ready: rows.filter((r) => r.risk === 'ready').length,
      total: rows.length,
    },
  };
}

// ---------------------------------------------------------------- validation helper shared by admin + faculty writes
async function assertProgressTarget({ schoolId, sessionId, classId, sectionId, subjectId, chapterIds }) {
  const [section, subject] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, classId, schoolId, class: { sessionId } }, select: { id: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, classId, sessionId, schoolId }, select: { id: true } }),
  ]);
  if (!section) throw httpError(404, 'Section not found in this class and session');
  if (!subject) throw httpError(404, 'Subject not found in this class and session');

  const unique = [...new Set(chapterIds)];
  const chapters = await prisma.syllabusChapter.findMany({
    where: { id: { in: unique }, schoolId, sessionId, classId, subjectId },
  });
  if (chapters.length !== unique.length) throw httpError(422, 'One or more chapters do not belong to this class and subject');
  return new Map(chapters.map((c) => [c.id, c]));
}

async function saveProgress({ schoolId, userId, sectionId, updates, today }) {
  const existing = await prisma.syllabusProgress.findMany({
    where: { schoolId, sectionId, chapterId: { in: updates.map((u) => u.chapterId) } },
  });
  const emap = new Map(existing.map((p) => [p.chapterId, p]));

  const ops = updates.map((u) => {
    const prev = emap.get(u.chapterId);
    const norm = normaliseProgress(u);
    if (u.completedOn && u.completedOn > today) throw httpError(422, 'Completion date cannot be in the future');

    const startedOn = norm.percentDone > 0 ? (prev && prev.startedOn) || cal.toDate(today) : null;
    const completedOn = norm.status === 'completed'
      ? (u.completedOn ? cal.toDate(u.completedOn) : (prev && prev.completedOn) || cal.toDate(today))
      : null;

    const data = {
      status: norm.status,
      percentDone: norm.percentDone,
      startedOn,
      completedOn,
      updatedById: userId,
      ...(u.isRevised !== undefined ? { isRevised: u.isRevised } : {}),
      ...(u.remarks !== undefined ? { remarks: u.remarks } : {}),
    };
    return prisma.syllabusProgress.upsert({
      where: { chapterId_sectionId: { chapterId: u.chapterId, sectionId } },
      create: { schoolId, chapterId: u.chapterId, sectionId, isRevised: false, ...data },
      update: data,
    });
  });

  await prisma.$transaction(ops);
  return ops.length;
}

// ---------------------------------------------------------------- templates
const classKey = (name) => {
  const m = String(name || '').match(/\d+/);
  return m ? m[0] : String(name || '').trim().toLowerCase();
};
const subjectKey = (name) => {
  const k = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (k.startsWith('math')) return 'math';
  if (k.startsWith('sci')) return 'science';
  return k;
};
const templateKey = (t) => `${t.board}|${t.className}|${t.subjectName}`.toLowerCase();

let starterPromise = null;
function ensureStarterTemplates() {
  if (!starterPromise) {
    starterPromise = (async () => {
      const existing = await prisma.syllabusTemplate.findMany({
        where: { isBuiltIn: true },
        select: { board: true, className: true, subjectName: true },
      });
      const have = new Set(existing.map(templateKey));
      const missing = STARTER_TEMPLATES.filter((t) => !have.has(templateKey(t)));
      if (missing.length) {
        await prisma.syllabusTemplate.createMany({
          data: missing.map((t) => ({
            schoolId: null,
            board: t.board,
            className: t.className,
            subjectName: t.subjectName,
            isBuiltIn: true,
            chapters: t.chapters.map((title) => ({ title, unitName: null, periods: 1 })),
          })),
        });
      }
    })().catch((err) => {
      starterPromise = null; // try again on the next request
      throw err;
    });
  }
  return starterPromise;
}

function templateMatchScore(t, className, subjectName) {
  let score = 0;
  if (className && classKey(t.className) === classKey(className)) score += 2;
  if (subjectName && subjectKey(t.subjectName) === subjectKey(subjectName)) score += 2;
  return score;
}

const cleanTemplateChapters = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((c) => ({
      title: String((c && c.title) || '').trim(),
      unitName: c && c.unitName ? String(c.unitName).trim() : null,
      periods: Math.max(1, Math.min(100, parseInt(c && c.periods, 10) || 1)),
    }))
    .filter((c) => c.title);

// ---------------------------------------------------------------- CSV import + copy planning (pure functions)
const HEADER_ALIASES = {
  class: 'class', classname: 'class',
  subject: 'subject', subjectname: 'subject',
  unit: 'unit', unitname: 'unit',
  chapter: 'chapter', chaptername: 'chapter', title: 'chapter', topic: 'chapter',
  periods: 'periods', plannedperiods: 'periods',
};

function parseSyllabusCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      columns: (header) => header.map((h) => HEADER_ALIASES[String(h).toLowerCase().replace(/[^a-z]/g, '')] || String(h).toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw httpError(422, `Could not read the CSV file: ${err.message}`);
  }
  if (!records.length) throw httpError(422, 'The CSV file has no rows');
  if (!('class' in records[0]) || !('subject' in records[0]) || !('chapter' in records[0])) {
    throw httpError(422, 'CSV must have the columns: class, subject, chapter (optional: unit, periods)');
  }
  return records.map((r, i) => ({ line: i + 2, ...r }));
}

function planCsvImport({ rows, classes, existing }) {
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));
  const seen = new Set(existing.map((e) => `${e.subjectId}|${e.title.trim().toLowerCase()}`));
  const nextOrder = new Map();
  for (const e of existing) nextOrder.set(e.subjectId, Math.max(nextOrder.get(e.subjectId) || 0, e.sortOrder + 1));

  const errors = [];
  const toCreate = [];
  let duplicate = 0;

  for (const r of rows) {
    const title = String(r.chapter || '').trim();
    if (!title) { errors.push({ line: r.line, message: 'Chapter name is empty' }); continue; }
    if (title.length > 200) { errors.push({ line: r.line, message: 'Chapter name is too long (max 200)' }); continue; }

    const cls = classByName.get(String(r.class || '').trim().toLowerCase());
    if (!cls) { errors.push({ line: r.line, message: `Class "${r.class}" not found in this session` }); continue; }
    const sub = cls.subjects.find((s) => s.name.trim().toLowerCase() === String(r.subject || '').trim().toLowerCase());
    if (!sub) { errors.push({ line: r.line, message: `Subject "${r.subject}" not found in ${cls.name}` }); continue; }

    let periods = 1;
    if (r.periods !== undefined && r.periods !== '') {
      periods = parseInt(r.periods, 10);
      if (!Number.isInteger(periods) || periods < 1 || periods > 100) { errors.push({ line: r.line, message: 'Periods must be a whole number from 1 to 100' }); continue; }
    }

    const key = `${sub.id}|${title.toLowerCase()}`;
    if (seen.has(key)) { duplicate += 1; continue; }
    seen.add(key);

    const sortOrder = nextOrder.get(sub.id) || 0;
    nextOrder.set(sub.id, sortOrder + 1);
    toCreate.push({ classId: cls.id, subjectId: sub.id, title, unitName: r.unit ? String(r.unit).trim().slice(0, 120) : null, plannedPeriods: periods, sortOrder });
  }

  return { toCreate, errors, summary: { totalRows: rows.length, toAdd: toCreate.length, duplicate, errorCount: errors.length } };
}

// Copy chapters from another session by matching class name + subject name
function planSyllabusCopy({ sourceChapters, sourceClasses, targetClasses, existing }) {
  const srcClass = new Map(sourceClasses.map((c) => [c.id, c]));
  const srcSubject = new Map();
  for (const c of sourceClasses) for (const s of c.subjects) srcSubject.set(s.id, s.name.trim().toLowerCase());
  const tgtClass = new Map(targetClasses.map((c) => [c.name.trim().toLowerCase(), c]));

  const seen = new Set(existing.map((e) => `${e.subjectId}|${e.title.trim().toLowerCase()}`));
  const summary = { total: sourceChapters.length, copied: 0, duplicate: 0, classMismatch: 0, subjectMismatch: 0 };
  const toCreate = [];

  for (const ch of sourceChapters) {
    const sc = srcClass.get(ch.classId);
    const tc = sc && tgtClass.get(sc.name.trim().toLowerCase());
    if (!tc) { summary.classMismatch += 1; continue; }
    const ts = tc.subjects.find((s) => s.name.trim().toLowerCase() === srcSubject.get(ch.subjectId));
    if (!ts) { summary.subjectMismatch += 1; continue; }

    const key = `${ts.id}|${ch.title.trim().toLowerCase()}`;
    if (seen.has(key)) { summary.duplicate += 1; continue; }
    seen.add(key);

    summary.copied += 1;
    toCreate.push({ classId: tc.id, subjectId: ts.id, title: ch.title, unitName: ch.unitName, plannedPeriods: ch.plannedPeriods, sortOrder: ch.sortOrder });
  }
  return { toCreate, summary };
}

// ---------------------------------------------------------------- calendar-aware auto schedule
async function workingDayList({ schoolId, sessionId, classId, start, end }) {
  const [settingsRow, events] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { sessionId } }),
    cal.fetchEvents({ schoolId, sessionId, role: 'admin' }),
  ]);
  const settings = cal.normalizeSettings(settingsRow);
  const off = new Set();
  const on = new Set();
  for (const e of events) {
    if (e.classIds.length && !e.classIds.includes(classId)) continue;
    if (e.kind !== 'holiday' && e.kind !== 'working_day') continue;
    const target = e.kind === 'holiday' ? off : on;
    for (const d of cal.eachDay(cal.maxStr(e.startDate, start), cal.minStr(e.endDate, end))) target.add(d);
  }
  return cal.eachDay(start, end).filter((d) => on.has(d) || (!cal.isWeeklyOff(d, settings) && !off.has(d)));
}

// Spreads chapters across the working days in proportion to their planned periods
function distributeChapters(chapters, days) {
  const n = days.length;
  if (!n || !chapters.length) return [];
  const weights = chapters.map(weightOf);
  const total = weights.reduce((a, b) => a + b, 0);
  let cum = 0;
  return chapters.map((c, i) => {
    const startIdx = Math.min(n - 1, Math.floor((cum / total) * n));
    cum += weights[i];
    const endIdx = Math.min(n - 1, Math.max(startIdx, Math.ceil((cum / total) * n) - 1));
    return { id: c.id, plannedStart: days[startIdx], plannedEnd: days[endIdx] };
  });
}

module.exports = {
  STALE_DAYS,
  round1,
  dateOrNull,
  ymdOrNull,
  getToday,
  normaliseProgress,
  expectedFraction,
  paceOf,
  examRisk,
  summarise,
  loadStructure,
  allCombos,
  teacherMap,
  computeRows,
  overviewSummary,
  findExamDate,
  buildReadiness,
  assertProgressTarget,
  saveProgress,
  ensureStarterTemplates,
  templateMatchScore,
  cleanTemplateChapters,
  parseSyllabusCsv,
  planCsvImport,
  planSyllabusCopy,
  workingDayList,
  distributeChapters,
};