const { prisma } = require('../config/db');
const httpError = require('../utils/httpError');
const cal = require('./calendar.service');
const syl = require('./syllabus.service');

// ---------------------------------------------------------------------------
// Teacher Reports: one place that turns attendance, marks, syllabus, corrections
// and audit-log data into per-teacher accountability numbers.
//
// How "expected work" is defined (there is no timetable in the system yet):
//   Attendance : one entry per active assignment (class + section + subject) per WORKING day.
//                Working days come from the Academic Calendar (weekly offs, holidays,
//                class-specific holidays and "working day" overrides).
//                Days before the assignment was created are not expected.
//                TODAY never counts against a teacher: it is "pending" until marked.
//   Marks      : every exam subject of a subject the teacher teaches, per section.
//                Complete = every active student of that section has a mark.
//                Overdue  = exam end date (from the calendar) passed more than 3 days ago.
//   Syllabus   : same section-subject rows the Syllabus Tracker uses (coverage vs plan).
// ---------------------------------------------------------------------------

const MAX_RANGE_DAYS = 92;
const MAX_GRID_DAYS = 62;
const MARKS_GRACE_DAYS = 3;
const WEIGHTS = { attendance: 0.4, marks: 0.3, syllabus: 0.3 };
const TRACKED_ACTIONS = ['MARK_ATTENDANCE', 'ENTER_MARKS', 'UPDATE_SYLLABUS_PROGRESS'];

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (a, b) => (b > 0 ? round1((a / b) * 100) : null);
const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
const diffDays = (a, b) => Math.round((cal.toDate(b).getTime() - cal.toDate(a).getTime()) / 86400000);

// ------------------------------------------------------------------ clock + range
async function getClock(schoolId) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { timezone: true } });
  let tz = (school && school.timezone) || 'Asia/Kolkata';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'Asia/Kolkata';
  }
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return {
    tz,
    today: dateFmt.format(new Date()),
    localDate: (d) => dateFmt.format(d),
    localTime: (d) => timeFmt.format(d),
  };
}

// Picks the session and a safe date range (never in the future, never outside the session)
async function resolveContext({ schoolId, query = {}, maxDays = MAX_RANGE_DAYS }) {
  const sessions = await prisma.academicSession.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } });
  const session = cal.resolveSession(sessions, query.sessionId);
  if (!session) throw httpError(404, 'No academic session has been set up yet');
  if (query.sessionId && session.id !== query.sessionId) throw httpError(404, 'Session not found');
  if (query.from && query.to && query.to < query.from) throw httpError(422, 'End date cannot be before start date');

  const clock = await getClock(schoolId);
  const last = cal.minStr(clock.today, cal.ymd(session.endDate));
  const to = query.to ? cal.minStr(query.to, last) : last;
  const from = cal.maxStr(query.from || cal.addDays(to, -6), cal.ymd(session.startDate));
  const days = from <= to ? cal.eachDay(from, to) : [];
  if (days.length > maxDays) throw httpError(422, `Please choose a range of ${maxDays} days or fewer`);
  return { sessions, session, clock, from, to, days };
}

// ------------------------------------------------------------------ calendar helpers
async function loadCalendar({ schoolId, sessionId, days }) {
  const [settingsRow, events] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { sessionId } }),
    cal.fetchEvents({ schoolId, sessionId, role: 'admin' }),
  ]);
  const settings = cal.normalizeSettings(settingsRow);
  const first = days[0];
  const last = days[days.length - 1];
  const cache = new Map();

  // Working days in range for a class (null = whole-school view, ignores class-specific events)
  function workingSet(classId = null) {
    const key = classId || '*';
    if (cache.has(key)) return cache.get(key);
    const off = new Set();
    const on = new Set();
    if (days.length) {
      for (const e of events) {
        if (e.kind !== 'holiday' && e.kind !== 'working_day') continue;
        if (e.classIds.length && (!classId || !e.classIds.includes(classId))) continue;
        const target = e.kind === 'holiday' ? off : on;
        for (const d of cal.eachDay(cal.maxStr(e.startDate, first), cal.minStr(e.endDate, last))) target.add(d);
      }
    }
    const set = new Set(days.filter((d) => on.has(d) || (!cal.isWeeklyOff(d, settings) && !off.has(d))));
    cache.set(key, set);
    return set;
  }

  // Exam window from the calendar (title contains the exam name, same rule as the syllabus module)
  function examWindow(examName, classId, today) {
    const list = events.filter(
      (e) => e.kind === 'exam'
        && e.title.toLowerCase().includes(String(examName).toLowerCase())
        && (!e.classIds.length || e.classIds.includes(classId)),
    );
    if (!list.length) return null;
    const ev = list.find((e) => e.endDate >= today) || list[list.length - 1];
    return { startDate: ev.startDate, endDate: ev.endDate };
  }

  return { workingSet, examWindow };
}

// ------------------------------------------------------------------ raw data loading
async function loadBundle({ schoolId, ctx, classId = null, facultyId = null }) {
  const { session, clock, from, to, days } = ctx;
  const sessionId = session.id;
  const today = clock.today;
  const lowerDay = cal.addDays(from, -1);
  const upperDay = cal.addDays(to, 2);
  const lower = cal.toDate(lowerDay);

  const facultyWhere = { schoolId, role: 'faculty', status: 'active', ...(facultyId ? { id: facultyId } : {}) };
  const [faculty, assignments, ctSections, enrolled, calendar] = await Promise.all([
    prisma.user.findMany({
      where: facultyWhere,
      select: { id: true, name: true, email: true, lastLogin: true },
      orderBy: { name: 'asc' },
    }),
    prisma.facultyAssignment.findMany({
      where: { sessionId, isActive: true, faculty: facultyWhere, ...(classId ? { classId } : {}) },
      select: {
        id: true, facultyId: true, classId: true, sectionId: true, subjectId: true, assignedAt: true,
        class: { select: { name: true } }, section: { select: { name: true } }, subject: { select: { name: true } },
      },
    }),
    prisma.section.findMany({
      where: { schoolId, class: { sessionId }, classTeacherId: { not: null } },
      select: { name: true, classTeacherId: true, class: { select: { name: true } } },
    }),
    prisma.enrollment.groupBy({ by: ['sectionId'], where: { sessionId, status: 'active' }, _count: { _all: true } }),
    loadCalendar({ schoolId, sessionId, days }),
  ]);

  // Teachers shown: everyone active, except when a class filter is on (then only teachers of that class)
  const people = new Map();
  for (const f of faculty) people.set(f.id, { user: f, assignments: [], classTeacherOf: [] });
  for (const a of assignments) if (people.has(a.facultyId)) people.get(a.facultyId).assignments.push(a);
  for (const s of ctSections) if (people.has(s.classTeacherId)) people.get(s.classTeacherId).classTeacherOf.push(`${s.class.name} ${s.name}`);
  if (classId) for (const [id, p] of people) if (!p.assignments.length) people.delete(id);

  const facultyIds = [...people.keys()];
  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];
  const enrolledBySection = new Map(enrolled.map((e) => [e.sectionId, e._count._all]));

  const noData = !facultyIds.length;
  const [attRows, marksRows, marksActRows, examSubjects, audit, progressUpdates, corrections, syllabusRows] = noData
    ? [[], [], [], [], [], [], [], []]
    : await Promise.all([
      days.length
        ? prisma.$queryRaw`
          SELECT e.section_id AS "sectionId", a.subject_id AS "subjectId",
                 to_char(a.date, 'YYYY-MM-DD') AS "date",
                 COUNT(*)::int AS "total",
                 SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)::int AS "present",
                 SUM(CASE WHEN a.status = 'absent'  THEN 1 ELSE 0 END)::int AS "absent",
                 SUM(CASE WHEN a.status = 'late'    THEN 1 ELSE 0 END)::int AS "late",
                 ARRAY_AGG(DISTINCT a.marked_by) AS "markers"
          FROM attendance a
          JOIN enrollments e ON e.id = a.enrollment_id
          WHERE e.session_id = ${sessionId}
            AND a.subject_id IS NOT NULL
            AND a.date >= ${from}::date AND a.date <= ${to}::date
          GROUP BY e.section_id, a.subject_id, a.date`
        : [],
      prisma.$queryRaw`
        SELECT m.exam_subject_id AS "examSubjectId", en.section_id AS "sectionId",
               COUNT(*)::int AS "entered", MAX(m.submitted_at) AS "lastEntry",
               ARRAY_AGG(DISTINCT m.entered_by) AS "enteredBy"
        FROM marks m
        JOIN enrollments en ON en.id = m.enrollment_id
        JOIN exam_subjects es ON es.id = m.exam_subject_id
        JOIN exam_types et ON et.id = es.exam_type_id
        WHERE et.session_id = ${sessionId}
        GROUP BY m.exam_subject_id, en.section_id`,
      days.length
        ? prisma.$queryRaw`
          SELECT t.entered_by AS "facultyId", t.local_date AS "date", COUNT(*)::int AS "records"
          FROM (
            SELECT m.entered_by,
                   to_char((m.submitted_at AT TIME ZONE 'UTC') AT TIME ZONE ${clock.tz}, 'YYYY-MM-DD') AS local_date
            FROM marks m
            JOIN exam_subjects es ON es.id = m.exam_subject_id
            JOIN exam_types et ON et.id = es.exam_type_id
            WHERE et.session_id = ${sessionId}
              AND m.submitted_at >= ${lowerDay}::timestamp AND m.submitted_at < ${upperDay}::timestamp
          ) t
          WHERE t.local_date >= ${from} AND t.local_date <= ${to}
          GROUP BY t.entered_by, t.local_date`
        : [],
      prisma.examSubject.findMany({
        where: { subjectId: { in: subjectIds }, examType: { schoolId, sessionId } },
        select: { id: true, subjectId: true, examType: { select: { id: true, name: true, classId: true, isLocked: true, sortOrder: true } } },
      }),
      days.length
        ? prisma.auditLog.findMany({
          where: { schoolId, actorId: { in: facultyIds }, action: { in: TRACKED_ACTIONS }, createdAt: { gte: lower } },
          select: { id: true, actorId: true, action: true, createdAt: true, resourceId: true, metadata: true },
          orderBy: { createdAt: 'asc' },
          take: 100000,
        })
        : [],
      days.length
        ? prisma.syllabusProgress.findMany({
          where: { schoolId, updatedById: { in: facultyIds }, updatedAt: { gte: lower, lt: cal.toDate(upperDay) }, section: { class: { sessionId } } },
          select: { updatedById: true, updatedAt: true },
        })
        : [],
      prisma.correctionRequest.findMany({
        where: { requestedBy: { in: facultyIds }, OR: [{ status: 'pending' }, { createdAt: { gte: lower, lt: cal.toDate(upperDay) } }] },
        select: { id: true, type: true, status: true, requestedBy: true, reason: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      syl.computeRows({
        schoolId,
        sessionId,
        today,
        combos: [...new Map(assignments.filter((a) => people.has(a.facultyId)).map((a) => [`${a.sectionId}|${a.subjectId}`, {
          classId: a.classId, className: a.class.name, sectionId: a.sectionId, sectionName: a.section.name,
          subjectId: a.subjectId, subjectName: a.subject.name,
        }])).values()],
      }),
    ]);

  // attendance sessions keyed by section|subject|date
  const attMap = new Map();
  for (const r of attRows) attMap.set(`${r.sectionId}|${r.subjectId}|${r.date}`, { ...r, markers: new Set((r.markers || []).filter(Boolean)) });

  // first time each attendance session was saved (from the audit log) -> "marked at" and late detection
  const firstMark = new Map();
  for (const l of audit) {
    if (l.action !== 'MARK_ATTENDANCE' || !l.metadata || !l.metadata.sectionId || !l.metadata.subjectId || !l.metadata.date) continue;
    const key = `${l.metadata.sectionId}|${l.metadata.subjectId}|${String(l.metadata.date).slice(0, 10)}`;
    if (!firstMark.has(key)) firstMark.set(key, { at: l.createdAt, by: l.actorId });
  }

  const marksMap = new Map(marksRows.map((r) => [`${r.examSubjectId}|${r.sectionId}`, { ...r, enteredBy: (r.enteredBy || []).filter(Boolean) }]));
  const examBySubject = new Map();
  for (const es of examSubjects) {
    if (!examBySubject.has(es.subjectId)) examBySubject.set(es.subjectId, []);
    examBySubject.get(es.subjectId).push(es);
  }
  const syllabusMap = new Map(syllabusRows.map((r) => [`${r.sectionId}|${r.subjectId}`, r]));

  // names for everybody who appears as a marker / mark-entrant but is not in the faculty list (admins etc.)
  const known = new Map(faculty.map((f) => [f.id, f.name]));
  const unknownIds = new Set();
  for (const r of attMap.values()) r.markers.forEach((id) => !known.has(id) && unknownIds.add(id));
  for (const r of marksMap.values()) r.enteredBy.forEach((id) => !known.has(id) && unknownIds.add(id));
  if (unknownIds.size) {
    const extra = await prisma.user.findMany({ where: { id: { in: [...unknownIds] }, schoolId }, select: { id: true, name: true } });
    extra.forEach((u) => known.set(u.id, u.name));
  }
  const nameOf = (id) => known.get(id) || 'Unknown';

  return {
    ctx, today, people, enrolledBySection, calendar, attMap, firstMark, marksMap, marksActRows,
    examBySubject, audit, progressUpdates, corrections, syllabusMap, nameOf,
  };
}

// ------------------------------------------------------------------ per-assignment calculations
function attendanceForAssignment(b, a) {
  const { ctx, today, calendar, attMap, firstMark } = b;
  const working = calendar.workingSet(a.classId);
  const assignedFrom = ctx.clock.localDate(a.assignedAt);
  const out = {
    cells: '', expected: 0, marked: 0, missing: 0, late: 0, extra: 0, pendingToday: 0, byOther: 0,
    missingDays: [], lastMarkedOn: null,
  };

  for (const day of ctx.days) {
    const key = `${a.sectionId}|${a.subjectId}|${day}`;
    const row = attMap.get(key);
    const isExpected = working.has(day) && day >= assignedFrom;

    if (row) {
      out.lastMarkedOn = day;
      if (isExpected) {
        const mine = row.markers.has(a.facultyId);
        out.expected += 1;
        out.marked += 1;
        if (!mine) out.byOther += 1;
        const fm = firstMark.get(key);
        if (fm && ctx.clock.localDate(fm.at) > day) out.late += 1;
        out.cells += mine ? 'M' : 'O';
      } else {
        out.extra += 1;
        out.cells += 'E';
      }
    } else if (isExpected) {
      if (day === today) {
        out.pendingToday += 1;
        out.cells += 'P';
      } else {
        out.expected += 1;
        out.missing += 1;
        out.missingDays.push(day);
        out.cells += 'X';
      }
    } else {
      out.cells += '-';
    }
  }
  out.compliancePct = pct(out.marked, out.expected);
  return out;
}

function marksForAssignment(b, a) {
  const rows = [];
  const expected = b.enrolledBySection.get(a.sectionId) || 0;
  if (!expected) return rows;
  for (const es of b.examBySubject.get(a.subjectId) || []) {
    const m = b.marksMap.get(`${es.id}|${a.sectionId}`);
    const entered = m ? m.entered : 0;
    const win = b.calendar.examWindow(es.examType.name, a.classId, b.today);
    const daysPastEnd = win ? diffDays(win.endDate, b.today) : null;

    let status = entered >= expected ? 'complete' : entered > 0 ? 'partial' : 'not_started';
    if (status === 'not_started' && win && win.startDate > b.today) status = 'upcoming';
    rows.push({
      key: `${a.id}|${es.id}`,
      facultyId: a.facultyId,
      examSubjectId: es.id,
      examTypeId: es.examType.id,
      examName: es.examType.name,
      examSort: es.examType.sortOrder,
      examLocked: es.examType.isLocked,
      classId: a.classId,
      className: a.class.name,
      sectionId: a.sectionId,
      sectionName: a.section.name,
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      expected,
      entered: Math.min(entered, expected),
      completionPct: pct(Math.min(entered, expected), expected),
      status,
      overdue: status !== 'complete' && status !== 'upcoming' && daysPastEnd !== null && daysPastEnd > MARKS_GRACE_DAYS,
      examStart: win ? win.startDate : null,
      examEnd: win ? win.endDate : null,
      daysPastEnd,
      lastEntryAt: m && m.lastEntry ? new Date(m.lastEntry).toISOString() : null,
      enteredBy: m ? m.enteredBy.map((id) => ({ id, name: b.nameOf(id) })) : [],
    });
  }
  return rows;
}

function syllabusForAssignment(b, a) {
  const r = b.syllabusMap.get(`${a.sectionId}|${a.subjectId}`);
  if (!r) return null;
  return {
    setUp: r.setUp, totalChapters: r.totalChapters, completedChapters: r.completedChapters,
    coveragePct: r.coveragePct, expectedPct: r.expectedPct, lagPct: r.lagPct, pace: r.pace,
    stale: r.stale, daysSinceUpdate: r.daysSinceUpdate, lastUpdated: r.lastUpdated,
  };
}

// ------------------------------------------------------------------ per-teacher roll-ups
function rollUpAttendance(assignments) {
  const t = {
    expected: sum(assignments, (a) => a.attendance.expected),
    marked: sum(assignments, (a) => a.attendance.marked),
    missing: sum(assignments, (a) => a.attendance.missing),
    late: sum(assignments, (a) => a.attendance.late),
    extra: sum(assignments, (a) => a.attendance.extra),
    pendingToday: sum(assignments, (a) => a.attendance.pendingToday),
    byOther: sum(assignments, (a) => a.attendance.byOther),
    lastMarkedOn: assignments.reduce((m, a) => (a.attendance.lastMarkedOn && (!m || a.attendance.lastMarkedOn > m) ? a.attendance.lastMarkedOn : m), null),
  };
  t.compliancePct = pct(t.marked, t.expected);
  return t;
}

function rollUpMarks(rows) {
  const counted = rows.filter((r) => r.status !== 'upcoming');
  const expected = sum(counted, (r) => r.expected);
  const entered = sum(counted, (r) => r.entered);
  return {
    examSubjects: rows.length,
    applicable: counted.length,
    complete: rows.filter((r) => r.status === 'complete').length,
    partial: rows.filter((r) => r.status === 'partial').length,
    notStarted: rows.filter((r) => r.status === 'not_started').length,
    upcoming: rows.filter((r) => r.status === 'upcoming').length,
    overdue: rows.filter((r) => r.overdue).length,
    expectedEntries: expected,
    enteredEntries: entered,
    completionPct: pct(entered, expected),
    lastEntryAt: rows.reduce((m, r) => (r.lastEntryAt && (!m || r.lastEntryAt > m) ? r.lastEntryAt : m), null),
  };
}

function rollUpSyllabus(assignments) {
  const rows = assignments.map((a) => a.syllabus).filter((r) => r && r.setUp);
  const planned = rows.filter((r) => r.expectedPct !== null && r.expectedPct !== undefined);
  const planScore = planned.length
    ? round1(sum(planned, (r) => (r.expectedPct > 0 ? Math.min(100, (r.coveragePct / r.expectedPct) * 100) : 100)) / planned.length)
    : null;
  return {
    subjects: assignments.length,
    tracked: rows.length,
    notSetUp: assignments.length - rows.length,
    avgCoveragePct: rows.length ? round1(sum(rows, (r) => r.coveragePct) / rows.length) : null,
    plannedRows: planned.length,
    planScore,
    behind: rows.filter((r) => r.pace === 'behind').length,
    slightlyBehind: rows.filter((r) => r.pace === 'slightly_behind').length,
    stale: rows.filter((r) => r.stale).length,
    lastUpdated: rows.reduce((m, r) => (r.lastUpdated && (!m || r.lastUpdated > m) ? r.lastUpdated : m), null),
  };
}

// Weighted score over whatever data exists (attendance 40, marks 30, syllabus 30)
function healthOf({ assignmentCount, attendance, marks, syllabus, activity }) {
  if (!assignmentCount) return { score: null, label: 'Unassigned', variant: 'default' };
  const parts = [];
  if (attendance.expected > 0) parts.push([WEIGHTS.attendance, attendance.compliancePct]);
  if (marks.applicable > 0) parts.push([WEIGHTS.marks, marks.completionPct]);
  if (syllabus.plannedRows > 0) parts.push([WEIGHTS.syllabus, syllabus.planScore]);
  const score = parts.length ? Math.round(sum(parts, (p) => p[0] * p[1]) / sum(parts, (p) => p[0])) : null;

  const hadWork = attendance.expected > 0 || marks.overdue > 0;
  if (!activity.total && hadWork) return { score, label: 'Inactive', variant: 'danger' };
  if (score === null) return { score, label: 'No data', variant: 'default' };
  if (score >= 85) return { score, label: 'Excellent', variant: 'success' };
  if (score >= 70) return { score, label: 'Good', variant: 'info' };
  if (score >= 50) return { score, label: 'Needs attention', variant: 'warning' };
  return { score, label: 'At risk', variant: 'danger' };
}

function activityFor(b, facultyId) {
  const days = new Set();
  let attendanceSessions = 0;
  for (const r of b.attMap.values()) {
    if (r.markers.has(facultyId)) { days.add(r.date); attendanceSessions += 1; }
  }
  let marksRecords = 0;
  for (const r of b.marksActRows) {
    if (r.facultyId === facultyId) { days.add(r.date); marksRecords += r.records; }
  }
  let syllabusUpdates = 0;
  for (const p of b.progressUpdates) {
    if (p.updatedById !== facultyId) continue;
    const d = b.ctx.clock.localDate(p.updatedAt);
    if (d >= b.ctx.from && d <= b.ctx.to) { days.add(d); syllabusUpdates += 1; }
  }
  let lastAt = null;
  for (const l of b.audit) {
    if (l.actorId !== facultyId) continue;
    const d = b.ctx.clock.localDate(l.createdAt);
    if (d >= b.ctx.from && d <= b.ctx.to) lastAt = l.createdAt;
  }
  return {
    activeDays: days.size,
    attendanceSessions,
    marksRecords,
    syllabusUpdates,
    total: attendanceSessions + marksRecords + syllabusUpdates,
    lastActivityAt: lastAt ? new Date(lastAt).toISOString() : null,
  };
}

// ------------------------------------------------------------------ main report
function assemble(b) {
  const { ctx } = b;
  const teachers = [];

  for (const [id, p] of b.people) {
    const assignments = p.assignments
      .map((a) => ({
        id: a.id,
        classId: a.classId, className: a.class.name,
        sectionId: a.sectionId, sectionName: a.section.name,
        subjectId: a.subjectId, subjectName: a.subject.name,
        students: b.enrolledBySection.get(a.sectionId) || 0,
        attendance: attendanceForAssignment(b, a),
        marks: marksForAssignment(b, a),
        syllabus: syllabusForAssignment(b, a),
      }))
      .sort((x, y) => x.className.localeCompare(y.className) || x.sectionName.localeCompare(y.sectionName) || x.subjectName.localeCompare(y.subjectName));

    const attendance = rollUpAttendance(assignments);
    const marksRows = assignments.flatMap((a) => a.marks);
    const marks = rollUpMarks(marksRows);
    const syllabus = rollUpSyllabus(assignments);
    const activity = activityFor(b, id);
    const own = b.corrections.filter((c) => c.requestedBy === id);
    const inRange = own.filter((c) => {
      const d = ctx.clock.localDate(c.createdAt);
      return d >= ctx.from && d <= ctx.to;
    });

    teachers.push({
      id,
      name: p.user.name,
      email: p.user.email,
      lastLogin: p.user.lastLogin ? new Date(p.user.lastLogin).toISOString() : null,
      classTeacherOf: p.classTeacherOf,
      assignmentCount: assignments.length,
      assignments,
      attendance,
      marks,
      syllabus,
      corrections: { pending: own.filter((c) => c.status === 'pending').length, inRange: inRange.length },
      activity,
      health: healthOf({ assignmentCount: assignments.length, attendance, marks, syllabus, activity }),
    });
  }

  const withWork = teachers.filter((t) => t.assignmentCount > 0);
  const allMarks = withWork.flatMap((t) => t.assignments.flatMap((a) => a.marks));
  const countedMarks = allMarks.filter((r) => r.status !== 'upcoming');
  const trackedSyl = withWork.flatMap((t) => t.assignments.map((a) => a.syllabus).filter((r) => r && r.setUp));

  const expected = sum(withWork, (t) => t.attendance.expected);
  const marked = sum(withWork, (t) => t.attendance.marked);
  const summary = {
    teachers: teachers.length,
    withAssignments: withWork.length,
    unassigned: teachers.length - withWork.length,
    activeTeachers: withWork.filter((t) => t.activity.total > 0).length,
    inactiveTeachers: withWork.filter((t) => t.health.label === 'Inactive').length,
    needsAttention: teachers.filter((t) => ['Inactive', 'At risk', 'Needs attention'].includes(t.health.label)).length,
    attendance: {
      expected, marked, missing: sum(withWork, (t) => t.attendance.missing),
      compliancePct: pct(marked, expected),
      late: sum(withWork, (t) => t.attendance.late),
      pendingToday: sum(withWork, (t) => t.attendance.pendingToday),
    },
    marks: {
      examSubjects: allMarks.length,
      complete: allMarks.filter((r) => r.status === 'complete').length,
      overdue: allMarks.filter((r) => r.overdue).length,
      completionPct: pct(sum(countedMarks, (r) => r.entered), sum(countedMarks, (r) => r.expected)),
    },
    syllabus: {
      tracked: trackedSyl.length,
      avgCoveragePct: trackedSyl.length ? round1(sum(trackedSyl, (r) => r.coveragePct) / trackedSyl.length) : null,
      behind: trackedSyl.filter((r) => r.pace === 'behind').length,
      stale: trackedSyl.filter((r) => r.stale).length,
    },
    corrections: { pending: sum(teachers, (t) => t.corrections.pending) },
  };

  return {
    session: cal.sessionDto(ctx.session),
    sessions: ctx.sessions.map(cal.sessionDto),
    range: {
      from: ctx.from, to: ctx.to, days: ctx.days.length, today: b.today,
      workingDays: b.calendar.workingSet(null).size,
    },
    summary,
    teachers,
  };
}

async function buildReport({ schoolId, query = {}, maxDays, facultyId = null }) {
  const ctx = await resolveContext({ schoolId, query, maxDays });
  const bundle = await loadBundle({ schoolId, ctx, classId: query.classId || null, facultyId });
  return { ctx, bundle, report: assemble(bundle) };
}

// ------------------------------------------------------------------ views built from the report
function pendingView(report, { limit = 5000 } = {}) {
  let total = 0;
  const groups = [];
  for (const t of report.teachers) {
    const items = [];
    for (const a of t.assignments) {
      for (const date of a.attendance.missingDays) {
        total += 1;
        if (total <= limit) {
          items.push({
            date, classId: a.classId, className: a.className, sectionId: a.sectionId, sectionName: a.sectionName,
            subjectId: a.subjectId, subjectName: a.subjectName,
          });
        }
      }
    }
    if (!items.length && !t.attendance.missing) continue;
    items.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    groups.push({ id: t.id, name: t.name, email: t.email, missing: t.attendance.missing, expected: t.attendance.expected, items });
  }
  groups.sort((x, y) => y.missing - x.missing || x.name.localeCompare(y.name));
  return { range: report.range, total, truncated: total > limit, teachers: groups };
}

function marksView(report) {
  const rows = [];
  for (const t of report.teachers) {
    for (const a of t.assignments) {
      for (const m of a.marks) rows.push({ ...m, facultyName: t.name, facultyEmail: t.email });
    }
  }
  const order = { complete: 4, upcoming: 3, partial: 1, not_started: 2 };
  rows.sort((x, y) => Number(y.overdue) - Number(x.overdue) || (order[x.status] - order[y.status]) || x.className.localeCompare(y.className) || x.subjectName.localeCompare(y.subjectName));
  const counted = rows.filter((r) => r.status !== 'upcoming');
  return {
    range: report.range,
    summary: {
      total: rows.length,
      complete: rows.filter((r) => r.status === 'complete').length,
      partial: rows.filter((r) => r.status === 'partial').length,
      notStarted: rows.filter((r) => r.status === 'not_started').length,
      upcoming: rows.filter((r) => r.status === 'upcoming').length,
      overdue: rows.filter((r) => r.overdue).length,
      completionPct: pct(sum(counted, (r) => r.entered), sum(counted, (r) => r.expected)),
    },
    rows,
  };
}

function gridView(report, b) {
  const working = b.calendar.workingSet(null);
  return {
    range: report.range,
    days: b.ctx.days.map((d) => ({ date: d, dow: cal.weekday(d), off: !working.has(d) })),
    teachers: report.teachers
      .filter((t) => t.assignmentCount > 0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        health: t.health,
        assignments: t.assignments.map((a) => ({
          id: a.id,
          label: `${a.className} · ${a.sectionName}`,
          subjectName: a.subjectName,
          cells: a.attendance.cells,
        })),
      })),
  };
}

// One teacher on one day: who marked what, when, and how many students
function dayDetail(b, report, { facultyId, date }) {
  const t = report.teachers.find((x) => x.id === facultyId);
  if (!t) throw httpError(404, 'Teacher not found');
  const clock = b.ctx.clock;
  const idx = b.ctx.days.indexOf(date);
  const statusByCode = { M: 'marked', O: 'marked_by_other', E: 'extra', X: 'missing', P: 'pending', '-': 'off' };
  const items = t.assignments.map((a) => {
    const key = `${a.sectionId}|${a.subjectId}|${date}`;
    const row = b.attMap.get(key);
    const code = idx >= 0 ? a.attendance.cells[idx] : '-';
    const fm = b.firstMark.get(key);
    return {
      assignmentId: a.id,
      className: a.className,
      sectionName: a.sectionName,
      subjectName: a.subjectName,
      status: statusByCode[code] || 'off',
      enrolled: a.students,
      recorded: row ? row.total : 0,
      present: row ? row.present : 0,
      absent: row ? row.absent : 0,
      late: row ? row.late : 0,
      markedBy: row ? [...row.markers].map((id) => ({ id, name: b.nameOf(id) })) : [],
      firstMarkedAt: fm ? `${clock.localDate(fm.at)} ${clock.localTime(fm.at)}` : null,
      lateByDays: fm && clock.localDate(fm.at) > date ? diffDays(date, clock.localDate(fm.at)) : 0,
    };
  });
  return {
    date,
    teacher: { id: t.id, name: t.name },
    isWorkingDay: b.calendar.workingSet(null).has(date),
    items,
  };
}

// Human readable activity feed for the teacher drill-down
function timelineView(b, report, facultyId, { limit = 60 } = {}) {
  const t = report.teachers.find((x) => x.id === facultyId);
  if (!t) return [];
  const sections = new Map(t.assignments.map((a) => [a.sectionId, `${a.className} ${a.sectionName}`]));
  const subjects = new Map(t.assignments.map((a) => [a.subjectId, a.subjectName]));
  const examSubjects = new Map();
  for (const list of b.examBySubject.values()) for (const es of list) examSubjects.set(es.id, es);
  const clock = b.ctx.clock;

  const out = [];
  for (const l of b.audit) {
    if (l.actorId !== facultyId) continue;
    const d = clock.localDate(l.createdAt);
    if (d < b.ctx.from || d > b.ctx.to) continue;
    const m = l.metadata || {};
    let text; let detail = '';
    if (l.action === 'MARK_ATTENDANCE') {
      text = `Marked attendance · ${sections.get(m.sectionId) || 'a class'} · ${subjects.get(m.subjectId) || 'a subject'}`;
      detail = `${m.date ? String(m.date).slice(0, 10) : ''}${m.count ? ` · ${m.count} students` : ''}`.replace(/^ · /, '');
    } else if (l.action === 'ENTER_MARKS') {
      const es = examSubjects.get(m.examSubjectId);
      text = `Entered marks · ${es ? es.examType.name : 'an exam'} · ${es ? (subjects.get(es.subjectId) || 'a subject') : 'a subject'}`;
      detail = m.count ? `${m.count} students` : '';
    } else {
      text = `Updated syllabus · ${sections.get(l.resourceId) || 'a class'} · ${subjects.get(m.subjectId) || 'a subject'}`;
      detail = m.count ? `${m.count} chapter${m.count === 1 ? '' : 's'}` : '';
    }
    out.push({ id: l.id, action: l.action, at: new Date(l.createdAt).toISOString(), atLocal: `${d} ${clock.localTime(l.createdAt)}`, text, detail });
  }
  return out.reverse().slice(0, limit);
}

function correctionsView(b, facultyId) {
  return b.corrections
    .filter((c) => c.requestedBy === facultyId)
    .slice(0, 20)
    .map((c) => ({ id: c.id, type: c.type, status: c.status, reason: c.reason, createdAt: new Date(c.createdAt).toISOString() }));
}

module.exports = {
  MAX_RANGE_DAYS,
  MAX_GRID_DAYS,
  MARKS_GRACE_DAYS,
  resolveContext,
  loadBundle,
  assemble,
  buildReport,
  pendingView,
  marksView,
  gridView,
  dayDetail,
  timelineView,
  correctionsView,
};