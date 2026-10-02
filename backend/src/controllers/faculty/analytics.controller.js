const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const {
  getFacultyViewableSections,
  canViewSection,
  getFacultyViewableSubjectIds,
} = require('../../services/facultyScope.service');

function isoWeekBounds(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay() || 7;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - day + 1);
  mon.setUTCHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  sun.setUTCHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function dayBounds(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start: d, end };
}

// Attendance is saved SUBJECT-WISE by faculty (subjectId is set), so "overall"
// attendance = every attendance record for the enrollment, whatever the subject.
// Returns Map(enrollmentId -> { total, present, late, absent }) using ONE query.
async function getAttendanceSummaryMap(enrollmentIds) {
  const map = new Map();
  if (!enrollmentIds.length) return map;

  const rows = await prisma.attendance.groupBy({
    by: ['enrollmentId', 'status'],
    where: { enrollmentId: { in: enrollmentIds } },
    _count: { _all: true },
  });

  for (const r of rows) {
    if (!map.has(r.enrollmentId)) {
      map.set(r.enrollmentId, { total: 0, present: 0, late: 0, absent: 0 });
    }
    const entry = map.get(r.enrollmentId);
    const n = r._count._all;
    entry.total += n;
    if (entry[r.status] !== undefined) entry[r.status] += n;
  }
  return map;
}

const getOverview = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const viewable = await getFacultyViewableSections({ facultyId: req.user.id, sessionId });

  if (viewable.length === 0) {
    return ApiResponse.success(res, 200, 'Overview fetched', {
      totalStudents: 0, avgAttendance: 0, marksEntered: 0, lowAttendanceCount: 0,
    });
  }

  const sectionPairs = viewable.map((v) => ({ classId: v.classId, sectionId: v.sectionId }));

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, OR: sectionPairs, status: 'active' },
    select: { id: true },
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const totalStudents = enrollmentIds.length;

  const summary = await getAttendanceSummaryMap(enrollmentIds);

  let totalAtt = 0;
  let presentAtt = 0;
  let lowAttendanceCount = 0;

  for (const eid of enrollmentIds) {
    const s = summary.get(eid);
    if (!s || s.total === 0) continue; // nothing marked yet -> not at risk
    totalAtt += s.total;
    presentAtt += s.present + s.late;
    const pct = ((s.present + s.late) / s.total) * 100;
    if (pct < 75) lowAttendanceCount++;
  }

  const avgAttendance = totalAtt > 0 ? Number(((presentAtt / totalAtt) * 100).toFixed(1)) : null;

  const marksEntered = await prisma.marks.count({
    where: { enteredBy: req.user.id, enrollmentId: { in: enrollmentIds } },
  });

  return ApiResponse.success(res, 200, 'Overview fetched', {
    totalStudents, avgAttendance, marksEntered, lowAttendanceCount,
  });
});

const getDailyAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, date } = req.query;
  if (!sessionId || !date) return ApiResponse.error(res, 422, 'sessionId and date are required');

  const { start, end } = dayBounds(date);

  const viewable = await getFacultyViewableSections({ facultyId: req.user.id, sessionId });
  if (viewable.length === 0) {
    return ApiResponse.success(res, 200, 'Daily attendance fetched', { date, totalStudents: 0, present: 0, absent: 0, late: 0, unmarked: 0 });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: viewable.map((v) => ({ classId: v.classId, sectionId: v.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);
  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, date: { gte: start, lte: end } },
    select: { status: true, enrollmentId: true },
  });

  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  const markedEnrollments = new Set();
  records.forEach((r) => {
    counts[r.status] = (counts[r.status] || 0) + 1;
    markedEnrollments.add(r.enrollmentId);
  });
  // A student can have several subject records in one day, so count distinct students
  counts.unmarked = Math.max(0, ids.length - markedEnrollments.size);

  return ApiResponse.success(res, 200, 'Daily attendance fetched', {
    date, totalStudents: ids.length, ...counts,
  });
});

const getWeeklyAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, date } = req.query;
  if (!sessionId || !date) return ApiResponse.error(res, 422, 'sessionId and date are required');

  const { start, end } = isoWeekBounds(date);

  const viewable = await getFacultyViewableSections({ facultyId: req.user.id, sessionId });
  if (viewable.length === 0) {
    return ApiResponse.success(res, 200, 'Weekly attendance fetched', { weekStart: start.toISOString().split('T')[0], days: [] });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: viewable.map((v) => ({ classId: v.classId, sectionId: v.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);

  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, date: { gte: start, lte: end } },
    select: { status: true, date: true },
  });

  const dayMap = {};
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  records.forEach((r) => {
    const d = new Date(r.date);
    const key = DAY_NAMES[d.getUTCDay()];
    if (!dayMap[key]) dayMap[key] = { day: key, present: 0, absent: 0, late: 0 };
    dayMap[key][r.status] = (dayMap[key][r.status] || 0) + 1;
  });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) =>
    dayMap[d] || { day: d, present: 0, absent: 0, late: 0 }
  );

  return ApiResponse.success(res, 200, 'Weekly attendance fetched', {
    weekStart: start.toISOString().split('T')[0], days,
  });
});

const getAttendanceTrend = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, days = '30' } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Number(days));
  start.setUTCHours(0, 0, 0, 0);

  const viewable = await getFacultyViewableSections({ facultyId: req.user.id, sessionId });
  if (viewable.length === 0) {
    return ApiResponse.success(res, 200, 'Attendance trend fetched', { trend: [], totalStudents: 0 });
  }

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: viewable.map((v) => ({ classId: v.classId, sectionId: v.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);

  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, date: { gte: start, lte: end } },
    select: { status: true, date: true },
    orderBy: { date: 'asc' },
  });

  const dateMap = {};
  records.forEach((r) => {
    const key = new Date(r.date).toISOString().split('T')[0];
    if (!dateMap[key]) dateMap[key] = { date: key, present: 0, absent: 0, late: 0 };
    dateMap[key][r.status] = (dateMap[key][r.status] || 0) + 1;
  });

  const trend = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

  return ApiResponse.success(res, 200, 'Attendance trend fetched', { trend, totalStudents: ids.length });
});

const getStudentStats = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId } = req.query;
  if (!sessionId || !classId || !sectionId) {
    return ApiResponse.error(res, 422, 'sessionId, classId and sectionId are required');
  }

  // Assigned to teach here OR the class teacher of this section — either grants view access.
  const { allowed } = await canViewSection({ facultyId: req.user.id, sessionId, classId, sectionId });
  if (!allowed) return ApiResponse.error(res, 403, 'You do not have access to this section');

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active' },
    include: { student: { select: { name: true, enrollmentNumber: true } } },
    orderBy: { rollNumber: 'asc' },
  });

  const summary = await getAttendanceSummaryMap(enrollments.map((e) => e.id));

  const results = enrollments.map((enr) => {
    const s = summary.get(enr.id) || { total: 0, present: 0, late: 0, absent: 0 };
    const pct = s.total > 0 ? Number((((s.present + s.late) / s.total) * 100).toFixed(1)) : null;

    return {
      enrollmentId: enr.id,
      studentName: enr.student.name,
      enrollmentNumber: enr.student.enrollmentNumber,
      rollNumber: enr.rollNumber,
      total: s.total,
      present: s.present,
      late: s.late,
      absent: s.absent,
      attendancePct: pct,
      risk: pct !== null && pct < 75 ? 'high' : pct !== null && pct < 85 ? 'medium' : 'low',
    };
  });

  results.sort((a, b) => (a.attendancePct ?? 100) - (b.attendancePct ?? 100));
  return ApiResponse.success(res, 200, 'Student stats fetched', results);
});

// Marks summary: subjects they personally teach, OR — if they're the class
// teacher of a section in this class — EVERY subject taught in the class.
const getMarksSummary = asyncHandler(async (req, res) => {
  const { sessionId, classId, subjectId } = req.query;
  if (!sessionId || !classId) return ApiResponse.error(res, 422, 'sessionId and classId are required');

  const viewableSubjectIds = await getFacultyViewableSubjectIds({ facultyId: req.user.id, sessionId, classId });
  const subjectIds = subjectId
    ? viewableSubjectIds.filter((id) => id === subjectId)
    : viewableSubjectIds;

  if (subjectIds.length === 0) {
    return ApiResponse.success(res, 200, 'Marks summary fetched', []);
  }

  const examSubjects = await prisma.examSubject.findMany({
    where: { subjectId: { in: subjectIds }, examType: { sessionId, classId } },
    include: {
      examType: { select: { name: true } },
      subject: { select: { name: true } },
      marks: { select: { marksObtained: true } },
    },
  });

  const summary = examSubjects.map((es) => {
    const vals = es.marks.map((m) => Number(m.marksObtained));
    const max = Number(es.maxMarks);
    const pass = Number(es.passingMarks);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const highest = vals.length > 0 ? Math.max(...vals) : null;
    const lowest = vals.length > 0 ? Math.min(...vals) : null;
    const passCount = vals.filter((v) => v >= pass).length;
    const passRate = vals.length > 0 ? Number(((passCount / vals.length) * 100).toFixed(1)) : null;

    return {
      examSubjectId: es.id,
      examType: es.examType.name,
      subject: es.subject.name,
      maxMarks: max, passingMarks: pass,
      totalEntered: vals.length,
      avg: avg !== null ? Number(avg.toFixed(1)) : null,
      highest, lowest, passRate,
    };
  });

  return ApiResponse.success(res, 200, 'Marks summary fetched', summary);
});

const getSectionComparison = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const viewable = await getFacultyViewableSections({ facultyId: req.user.id, sessionId });
  if (viewable.length === 0) return ApiResponse.success(res, 200, 'Section comparison fetched', []);

  const classIds = [...new Set(viewable.map((v) => v.classId))];
  const sectionIds = [...new Set(viewable.map((v) => v.sectionId))];

  const [classes, sections] = await Promise.all([
    prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }),
  ]);
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));

  const results = await Promise.all(
    viewable.map(async (v) => {
      const enrollments = await prisma.enrollment.findMany({
        where: { sessionId, classId: v.classId, sectionId: v.sectionId, status: 'active' },
        select: { id: true },
      });
      const ids = enrollments.map((e) => e.id);

      // All subject-wise attendance records for this section
      const total = await prisma.attendance.count({ where: { enrollmentId: { in: ids } } });
      const present = await prisma.attendance.count({
        where: { enrollmentId: { in: ids }, status: { in: ['present', 'late'] } },
      });
      const pct = total > 0 ? Number(((present / total) * 100).toFixed(1)) : null;

      return {
        label: `${classNameById.get(v.classId)} – ${sectionNameById.get(v.sectionId)}`,
        classId: v.classId,
        sectionId: v.sectionId,
        isClassTeacher: v.isClassTeacher,
        pct,
        totalStudents: ids.length,
      };
    })
  );

  return ApiResponse.success(res, 200, 'Section comparison fetched', results);
});

module.exports = {
  getOverview, getDailyAttendance, getWeeklyAttendance,
  getAttendanceTrend, getStudentStats, getMarksSummary, getSectionComparison,
};