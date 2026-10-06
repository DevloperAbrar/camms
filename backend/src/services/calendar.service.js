const { prisma } = require('../config/db');

const DAY_MS = 86400000;
const KIND_PRIORITY = { working_day: 4, holiday: 3, exam: 2, event: 1 };

const DEFAULT_CATEGORIES = [
  { name: 'Public Holiday', kind: 'holiday', color: '#ef4444' },
  { name: 'Festival', kind: 'holiday', color: '#f97316' },
  { name: 'Vacation', kind: 'holiday', color: '#0ea5e9' },
  { name: 'Examination', kind: 'exam', color: '#6366f1' },
  { name: 'Parent-Teacher Meeting', kind: 'event', color: '#14b8a6' },
  { name: 'Sports & Cultural', kind: 'event', color: '#a855f7' },
  { name: 'School Event', kind: 'event', color: '#3b82f6' },
  { name: 'Working Day', kind: 'working_day', color: '#16a34a' },
];

// ---- date helpers (everything is handled as 'YYYY-MM-DD' strings in UTC) ----
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const toDate = (s) => new Date(`${s}T00:00:00.000Z`);
const addDays = (s, n) => ymd(new Date(toDate(s).getTime() + n * DAY_MS));
const diffDays = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
const weekday = (s) => toDate(s).getUTCDay();
const maxStr = (a, b) => (a > b ? a : b);
const minStr = (a, b) => (a < b ? a : b);

function eachDay(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function isWeeklyOff(s, settings) {
  const wd = weekday(s);
  if ((settings.weeklyOffDays || []).includes(wd)) return true;
  if (wd === 6 && (settings.offSaturdays || []).includes(Math.ceil(Number(s.slice(8, 10)) / 7))) return true;
  return false;
}

function normalizeSettings(row) {
  return {
    weeklyOffDays: row ? row.weeklyOffDays : [0],
    offSaturdays: row ? row.offSaturdays : [],
  };
}

// New schools get the default categories the first time they open the calendar
async function ensureDefaultCategories(schoolId) {
  const count = await prisma.calendarCategory.count({ where: { schoolId } });
  if (count > 0) return;
  await prisma.calendarCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, schoolId, sortOrder: i })),
    skipDuplicates: true,
  });
}

function serializeEvent(e) {
  return {
    id: e.id,
    categoryId: e.categoryId,
    categoryName: e.category ? e.category.name : null,
    color: e.category ? e.category.color : '#64748b',
    kind: e.kind,
    title: e.title,
    description: e.description,
    startDate: ymd(e.startDate),
    endDate: ymd(e.endDate),
    startTime: e.startTime,
    endTime: e.endTime,
    location: e.location,
    audience: e.audience,
    classIds: e.classIds || [],
    needsReview: e.needsReview,
  };
}

function sessionDto(s) {
  return { id: s.id, label: s.label, isActive: s.isActive, startDate: ymd(s.startDate), endDate: ymd(s.endDate) };
}

function resolveSession(sessions, requestedId) {
  if (!sessions.length) return null;
  return (
    (requestedId && sessions.find((s) => s.id === requestedId)) ||
    sessions.find((s) => s.isActive) ||
    sessions[0]
  );
}

// Working days per month. Only whole-school holidays and overrides are counted here.
function computeStats(session, settings, events) {
  const sStart = ymd(session.startDate);
  const sEnd = ymd(session.endDate);
  const holidayDays = new Set();
  const workDays = new Set();

  for (const e of events) {
    if (e.classIds.length) continue;
    if (e.kind !== 'holiday' && e.kind !== 'working_day') continue;
    const target = e.kind === 'holiday' ? holidayDays : workDays;
    for (const d of eachDay(maxStr(e.startDate, sStart), minStr(e.endDate, sEnd))) target.add(d);
  }

  const months = new Map();
  let totalWorkingDays = 0;
  let totalOffDays = 0;
  for (const d of eachDay(sStart, sEnd)) {
    const working = workDays.has(d) || (!isWeeklyOff(d, settings) && !holidayDays.has(d));
    const key = d.slice(0, 7);
    if (!months.has(key)) months.set(key, { key, workingDays: 0, offDays: 0 });
    const m = months.get(key);
    if (working) {
      m.workingDays += 1;
      totalWorkingDays += 1;
    } else {
      m.offDays += 1;
      totalOffDays += 1;
    }
  }

  return {
    months: Array.from(months.values()),
    totalWorkingDays,
    totalOffDays,
    holidayCount: events.filter((e) => e.kind === 'holiday').length,
    examCount: events.filter((e) => e.kind === 'exam').length,
    eventCount: events.filter((e) => e.kind === 'event').length,
    needsReviewCount: events.filter((e) => e.needsReview).length,
  };
}

async function fetchEvents({ schoolId, sessionId, role, classId }) {
  const where = { schoolId, sessionId };
  if (role === 'parent') {
    where.audience = 'all';
    where.OR = [{ classIds: { isEmpty: true } }, { classIds: { has: classId } }];
  }
  const rows = await prisma.calendarEvent.findMany({
    where,
    include: { category: true },
    orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
  });
  return rows.map(serializeEvent);
}

async function getClassNames(schoolId, ids) {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return {};
  const rows = await prisma.class.findMany({
    where: { schoolId, id: { in: unique } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((c) => [c.id, c.name]));
}

function buildPayload({ school, sessions, session, settings, events, categories, classes, classNames, role }) {
  return {
    role,
    school: { id: school.id, name: school.name, address: school.address || null },
    sessions: sessions.map(sessionDto),
    session: session ? sessionDto(session) : null,
    settings,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      color: c.color,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    })),
    events,
    classes: classes || [],
    classNames: classNames || {},
    stats: session ? computeStats(session, settings, events) : null,
  };
}

// ---- copy from a previous session (pure function, no database access) ----
function shiftDate(s, mode, yearsDiff, shiftDays) {
  if (mode === 'same_weekday') return addDays(s, shiftDays);
  const [y, m, d] = s.split('-').map(Number);
  const ny = y + yearsDiff;
  const lastDay = new Date(Date.UTC(ny, m, 0)).getUTCDate();
  return `${ny}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

function planCopy({ sourceSession, targetSession, sourceEvents, sourceClasses, targetClasses, existing, mode, kinds }) {
  const srcStart = ymd(sourceSession.startDate);
  const tgtStart = ymd(targetSession.startDate);
  const tgtEnd = ymd(targetSession.endDate);
  const yearsDiff = Number(tgtStart.slice(0, 4)) - Number(srcStart.slice(0, 4));
  const shiftDays = Math.round(diffDays(srcStart, tgtStart) / 7) * 7;

  const srcClassName = Object.fromEntries(sourceClasses.map((c) => [c.id, c.name.trim().toLowerCase()]));
  const tgtClassByName = Object.fromEntries(targetClasses.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const seen = new Set(existing.map((e) => `${e.title.trim().toLowerCase()}|${e.startDate}`));
  const summary = { total: 0, copied: 0, outOfRange: 0, duplicate: 0, classMismatch: 0, byKind: {} };
  const toCreate = [];

  for (const e of sourceEvents) {
    if (kinds && kinds.length && !kinds.includes(e.kind)) continue;
    summary.total += 1;

    let startDate = shiftDate(e.startDate, mode, yearsDiff, shiftDays);
    let endDate = shiftDate(e.endDate, mode, yearsDiff, shiftDays);
    if (endDate < startDate) endDate = startDate;

    if (startDate < tgtStart || endDate > tgtEnd) {
      summary.outOfRange += 1;
      continue;
    }

    let classIds = [];
    if (e.classIds.length) {
      classIds = e.classIds.map((id) => tgtClassByName[srcClassName[id]]).filter(Boolean);
      if (!classIds.length) {
        summary.classMismatch += 1;
        continue;
      }
    }

    const key = `${e.title.trim().toLowerCase()}|${startDate}`;
    if (seen.has(key)) {
      summary.duplicate += 1;
      continue;
    }
    seen.add(key);

    summary.copied += 1;
    summary.byKind[e.kind] = (summary.byKind[e.kind] || 0) + 1;
    toCreate.push({ ...e, startDate, endDate, classIds });
  }

  return { toCreate, summary };
}

module.exports = {
  KIND_PRIORITY,
  DEFAULT_CATEGORIES,
  pad,
  ymd,
  toDate,
  addDays,
  weekday,
  maxStr,
  minStr,
  eachDay,
  isWeeklyOff,
  normalizeSettings,
  ensureDefaultCategories,
  serializeEvent,
  sessionDto,
  resolveSession,
  computeStats,
  fetchEvents,
  getClassNames,
  buildPayload,
  planCopy,
};