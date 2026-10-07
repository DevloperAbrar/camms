const { stringify } = require('csv-stringify/sync');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createBulkNotifications } = require('../../services/notification.service');
const cal = require('../../services/calendar.service');
const svc = require('../../services/teacherReport.service');
const v = require('../../validators/teacherreport.validator');

const MAX_REMINDER_PICK = 3;

const withoutAssignments = (t) => {
  const { assignments, ...rest } = t;
  return {
    ...rest,
    assignmentLabels: assignments.map((a) => `${a.className} ${a.sectionName} · ${a.subjectName}`),
  };
};

function sendCsv(res, name, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]+/g, '-')}.csv"`);
  return res.send(`\uFEFF${stringify(rows)}`); // BOM so Excel shows Hindi / accented names correctly
}

// GET /schooladmin/teacher-reports/filters
// Session + class pickers for the page header
const getFilters = asyncHandler(async (req, res) => {
  const q = v.rangeQuerySchema.parse(req.query);
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });
  const session = cal.resolveSession(sessions, q.sessionId);
  if (!session) {
    return ApiResponse.success(res, 200, 'Filters fetched', { sessions: [], session: null, classes: [] });
  }
  const classes = await prisma.class.findMany({
    where: { schoolId: req.schoolId, sessionId: session.id },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });
  return ApiResponse.success(res, 200, 'Filters fetched', {
    sessions: sessions.map(cal.sessionDto),
    session: cal.sessionDto(session),
    classes,
  });
});

// GET /schooladmin/teacher-reports/overview
// One row per teacher: attendance, marks, syllabus, corrections, activity and a health score
const getOverview = asyncHandler(async (req, res) => {
  const query = v.rangeQuerySchema.parse(req.query);
  const { report } = await svc.buildReport({ schoolId: req.schoolId, query });
  return ApiResponse.success(res, 200, 'Teacher overview fetched', {
    session: report.session,
    range: report.range,
    summary: report.summary,
    teachers: report.teachers.map(withoutAssignments),
  });
});

// GET /schooladmin/teacher-reports/day-grid
// Teachers x days. Each assignment carries a compact string: M marked, O marked by someone else,
// X missing, P pending today, E extra (marked on a non-working day), - nothing expected
const getDayGrid = asyncHandler(async (req, res) => {
  const query = v.rangeQuerySchema.parse(req.query);
  const { bundle, report } = await svc.buildReport({ schoolId: req.schoolId, query, maxDays: svc.MAX_GRID_DAYS });
  return ApiResponse.success(res, 200, 'Day-wise grid fetched', svc.gridView(report, bundle));
});

// GET /schooladmin/teacher-reports/pending
const getPending = asyncHandler(async (req, res) => {
  const query = v.rangeQuerySchema.parse(req.query);
  const { report } = await svc.buildReport({ schoolId: req.schoolId, query });
  return ApiResponse.success(res, 200, 'Pending attendance fetched', svc.pendingView(report));
});

// GET /schooladmin/teacher-reports/marks
const getMarksTracker = asyncHandler(async (req, res) => {
  const query = v.rangeQuerySchema.parse(req.query);
  const { report } = await svc.buildReport({ schoolId: req.schoolId, query });
  return ApiResponse.success(res, 200, 'Marks tracker fetched', svc.marksView(report));
});

// GET /schooladmin/teacher-reports/teachers/:id
// Everything about one teacher: assignments, day-by-day cells, marks, syllabus, activity feed
const getTeacherDetail = asyncHandler(async (req, res) => {
  const query = v.teacherQuerySchema.parse(req.query);
  const { id: facultyId } = v.idParamSchema.parse(req.params);
  const { bundle, report } = await svc.buildReport({
    schoolId: req.schoolId,
    query: { ...query, classId: undefined },
    maxDays: svc.MAX_GRID_DAYS,
    facultyId,
  });
  const teacher = report.teachers.find((t) => t.id === facultyId);
  if (!teacher) throw httpError(404, 'Teacher not found');

  const grid = svc.gridView(report, bundle);
  return ApiResponse.success(res, 200, 'Teacher report fetched', {
    session: report.session,
    range: report.range,
    days: grid.days,
    teacher,
    timeline: svc.timelineView(bundle, report, facultyId),
    corrections: svc.correctionsView(bundle, facultyId),
  });
});

// GET /schooladmin/teacher-reports/day-detail
const getDayDetail = asyncHandler(async (req, res) => {
  const q = v.dayDetailQuerySchema.parse(req.query);
  const ctx = await svc.resolveContext({ schoolId: req.schoolId, query: { sessionId: q.sessionId, from: q.date, to: q.date } });
  if (!ctx.days.length) throw httpError(422, 'That date is outside the academic session or in the future');
  const bundle = await svc.loadBundle({ schoolId: req.schoolId, ctx, facultyId: q.facultyId });
  const report = svc.assemble(bundle);
  return ApiResponse.success(res, 200, 'Day detail fetched', svc.dayDetail(bundle, report, { facultyId: q.facultyId, date: q.date }));
});

// GET /schooladmin/teacher-reports/export?type=summary|pending|marks|daily
const exportCsv = asyncHandler(async (req, res) => {
  const q = v.exportQuerySchema.parse(req.query);
  const { type, ...query } = q;
  const { bundle, report } = await svc.buildReport({
    schoolId: req.schoolId,
    query,
    maxDays: type === 'daily' ? svc.MAX_GRID_DAYS : svc.MAX_RANGE_DAYS,
  });
  const name = `teacher-${type}-${report.range.from}_to_${report.range.to}`;

  if (type === 'pending') {
    const rows = [['Teacher', 'Email', 'Date', 'Class', 'Section', 'Subject']];
    for (const t of svc.pendingView(report, { limit: 1e9 }).teachers) {
      for (const i of t.items) rows.push([t.name, t.email, i.date, i.className, i.sectionName, i.subjectName]);
    }
    return sendCsv(res, name, rows);
  }

  if (type === 'marks') {
    const rows = [['Exam', 'Class', 'Section', 'Subject', 'Teacher', 'Students', 'Marks entered', 'Completion %', 'Status', 'Overdue', 'Exam ends', 'Days since exam end', 'Last entry']];
    for (const m of svc.marksView(report).rows) {
      rows.push([m.examName, m.className, m.sectionName, m.subjectName, m.facultyName, m.expected, m.entered, m.completionPct ?? '', m.status, m.overdue ? 'Yes' : 'No', m.examEnd || '', m.daysPastEnd ?? '', m.lastEntryAt || '']);
    }
    return sendCsv(res, name, rows);
  }

  if (type === 'daily') {
    const label = { M: 'Marked', O: 'Marked (other)', X: 'Missing', P: 'Pending', E: 'Extra', '-': '' };
    const grid = svc.gridView(report, bundle);
    const rows = [['Teacher', 'Class', 'Subject', ...grid.days.map((d) => d.date)]];
    for (const t of grid.teachers) {
      for (const a of t.assignments) rows.push([t.name, a.label, a.subjectName, ...a.cells.split('').map((c) => label[c] ?? '')]);
    }
    return sendCsv(res, name, rows);
  }

  const rows = [[
    'Teacher', 'Email', 'Class teacher of', 'Assignments', 'Attendance expected', 'Attendance marked', 'Attendance missing',
    'Attendance compliance %', 'Late entries', 'Exam subjects', 'Marks completion %', 'Marks overdue', 'Syllabus tracked',
    'Syllabus avg coverage %', 'Syllabus behind', 'Syllabus stale', 'Pending corrections', 'Active days', 'Last activity', 'Last login', 'Health score', 'Health',
  ]];
  for (const t of report.teachers) {
    rows.push([
      t.name, t.email, t.classTeacherOf.join(' / '), t.assignmentCount, t.attendance.expected, t.attendance.marked, t.attendance.missing,
      t.attendance.compliancePct ?? '', t.attendance.late, t.marks.examSubjects, t.marks.completionPct ?? '', t.marks.overdue, t.syllabus.tracked,
      t.syllabus.avgCoveragePct ?? '', t.syllabus.behind + t.syllabus.slightlyBehind, t.syllabus.stale, t.corrections.pending, t.activity.activeDays,
      t.activity.lastActivityAt || '', t.lastLogin || '', t.health.score ?? '', t.health.label,
    ]);
  }
  return sendCsv(res, name, rows);
});

// POST /schooladmin/teacher-reports/remind
// Sends an in-app notification to each chosen teacher. The counts in the message are
// recomputed on the server so the client cannot send a made-up number.
// One reminder per teacher per kind per day.
const sendReminders = asyncHandler(async (req, res) => {
  const data = v.reminderSchema.parse(req.body);
  const { sessionId, from, to, classId, kind, facultyIds, note } = data;
  const { report } = await svc.buildReport({ schoolId: req.schoolId, query: { sessionId, from, to, classId } });

  const wanted = new Set(facultyIds);
  const chosen = report.teachers.filter((t) => wanted.has(t.id));
  if (!chosen.length) throw httpError(404, 'No matching teachers found');

  const type = kind === 'attendance' ? 'attendance_reminder' : 'marks_reminder';
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.notification.findMany({
    where: { recipientRef: { in: chosen.map((t) => t.id) }, type, createdAt: { gte: since } },
    select: { recipientRef: true },
  });
  const alreadySet = new Set(recent.map((n) => n.recipientRef));

  const toCreate = [];
  const skipped = [];
  for (const t of chosen) {
    if (alreadySet.has(t.id)) {
      skipped.push({ id: t.id, name: t.name, reason: 'Already reminded in the last 24 hours' });
      continue;
    }
    let message = null;
    if (kind === 'attendance' && t.attendance.missing > 0) {
      const items = t.assignments
        .flatMap((a) => a.attendance.missingDays.map((d) => ({ d, label: `${a.className} ${a.sectionName} - ${a.subjectName}` })))
        .sort((x, y) => (x.d < y.d ? 1 : -1));
      const sample = items.slice(0, MAX_REMINDER_PICK).map((i) => `${i.d} (${i.label})`).join(', ');
      message = `You have ${t.attendance.missing} attendance ${t.attendance.missing === 1 ? 'entry' : 'entries'} pending between ${report.range.from} and ${report.range.to}. Most recent: ${sample}${items.length > MAX_REMINDER_PICK ? ` and ${items.length - MAX_REMINDER_PICK} more` : ''}. Please mark them as soon as possible.`;
    }
    if (kind === 'marks') {
      const overdue = t.assignments.flatMap((a) => a.marks.filter((m) => m.overdue));
      if (overdue.length) {
        const sample = overdue.slice(0, MAX_REMINDER_PICK).map((m) => `${m.examName} - ${m.subjectName} (${m.sectionName}, ${m.entered}/${m.expected} done)`).join(', ');
        message = `Marks entry is overdue for ${overdue.length} exam ${overdue.length === 1 ? 'subject' : 'subjects'}: ${sample}${overdue.length > MAX_REMINDER_PICK ? ` and ${overdue.length - MAX_REMINDER_PICK} more` : ''}. Please complete them.`;
      }
    }
    if (!message) {
      skipped.push({ id: t.id, name: t.name, reason: 'Nothing pending' });
      continue;
    }
    toCreate.push({
      schoolId: req.schoolId,
      recipientType: 'faculty',
      recipientRef: t.id,
      title: kind === 'attendance' ? 'Attendance pending' : 'Marks entry pending',
      message: note ? `${message} Note from admin: ${note}` : message,
      type,
    });
  }

  if (toCreate.length) await createBulkNotifications(toCreate);
  await logAudit({ req, action: 'SEND_TEACHER_REMINDER', resourceType: 'user', metadata: { kind, sent: toCreate.length, skipped: skipped.length } });

  if (!toCreate.length) {
    return ApiResponse.error(res, 409, skipped.length === 1 ? skipped[0].reason : 'No reminders were sent', { skipped });
  }
  return ApiResponse.success(res, 200, `Reminder sent to ${toCreate.length} teacher${toCreate.length === 1 ? '' : 's'}`, { sent: toCreate.length, skipped });
});

module.exports = {
  getFilters,
  getOverview,
  getDayGrid,
  getPending,
  getMarksTracker,
  getTeacherDetail,
  getDayDetail,
  exportCsv,
  sendReminders,
};