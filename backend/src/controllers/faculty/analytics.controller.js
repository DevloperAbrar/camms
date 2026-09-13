const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

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

const getOverview = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, sessionId, isActive: true },
    select: { classId: true, sectionId: true },
  });

  if (assignments.length === 0) {
    return ApiResponse.success(res, 200, 'Overview fetched', {
      totalStudents: 0, avgAttendance: 0, marksEntered: 0, lowAttendanceCount: 0,
    });
  }

  const sectionPairs = assignments.map((a) => ({ classId: a.classId, sectionId: a.sectionId }));

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, OR: sectionPairs, status: 'active' },
    select: { id: true },
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const totalStudents = enrollmentIds.length;

  const [totalAtt, presentAtt] = await Promise.all([
    prisma.attendance.count({ where: { enrollmentId: { in: enrollmentIds }, subjectId: null } }),
    prisma.attendance.count({
      where: { enrollmentId: { in: enrollmentIds }, subjectId: null, status: { in: ['present', 'late'] } },
    }),
  ]);

  const avgAttendance = totalAtt > 0 ? Number(((presentAtt / totalAtt) * 100).toFixed(1)) : null;

  const marksEntered = await prisma.marks.count({
    where: { enteredBy: req.user.id, enrollmentId: { in: enrollmentIds } },
  });

  let lowAttendanceCount = 0;
  for (const eid of enrollmentIds) {
    const tot = await prisma.attendance.count({ where: { enrollmentId: eid, subjectId: null } });
    const pres = await prisma.attendance.count({
      where: { enrollmentId: eid, subjectId: null, status: { in: ['present', 'late'] } },
    });
    const pct = tot > 0 ? (pres / tot) * 100 : 100;
    if (pct < 75) lowAttendanceCount++;
  }

  return ApiResponse.success(res, 200, 'Overview fetched', {
    totalStudents, avgAttendance, marksEntered, lowAttendanceCount,
  });
});

const getDailyAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, date } = req.query;
  if (!sessionId || !date) return ApiResponse.error(res, 422, 'sessionId and date are required');

  const { start, end } = dayBounds(date);

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, sessionId, isActive: true },
    select: { classId: true, sectionId: true },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: assignments.map((a) => ({ classId: a.classId, sectionId: a.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);
  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, subjectId: null, date: { gte: start, lte: end } },
    select: { status: true },
  });

  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  records.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  counts.unmarked = ids.length - records.length;

  return ApiResponse.success(res, 200, 'Daily attendance fetched', {
    date, totalStudents: ids.length, ...counts,
  });
});

const getWeeklyAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, date } = req.query;
  if (!sessionId || !date) return ApiResponse.error(res, 422, 'sessionId and date are required');

  const { start, end } = isoWeekBounds(date);

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, sessionId, isActive: true },
    select: { classId: true, sectionId: true },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: assignments.map((a) => ({ classId: a.classId, sectionId: a.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);

  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, subjectId: null, date: { gte: start, lte: end } },
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

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, sessionId, isActive: true },
    select: { classId: true, sectionId: true },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      OR: assignments.map((a) => ({ classId: a.classId, sectionId: a.sectionId })),
    },
    select: { id: true },
  });

  const ids = enrollments.map((e) => e.id);

  const records = await prisma.attendance.findMany({
    where: { enrollmentId: { in: ids }, subjectId: null, date: { gte: start, lte: end } },
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

  const isAssigned = await prisma.facultyAssignment.findFirst({
    where: { facultyId: req.user.id, sessionId, classId, sectionId, isActive: true },
  });
  if (!isAssigned) return ApiResponse.error(res, 403, 'Not assigned to this section');

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active' },
    include: { student: { select: { name: true, enrollmentNumber: true } } },
    orderBy: { rollNumber: 'asc' },
  });

  const results = [];
  for (const enr of enrollments) {
    const total = await prisma.attendance.count({ where: { enrollmentId: enr.id, subjectId: null } });
    const present = await prisma.attendance.count({
      where: { enrollmentId: enr.id, subjectId: null, status: 'present' },
    });
    const late = await prisma.attendance.count({
      where: { enrollmentId: enr.id, subjectId: null, status: 'late' },
    });
    const absent = total - present - late;
    const pct = total > 0 ? Number((((present + late) / total) * 100).toFixed(1)) : null;

    results.push({
      enrollmentId: enr.id,
      studentName: enr.student.name,
      enrollmentNumber: enr.student.enrollmentNumber,
      rollNumber: enr.rollNumber,
      total, present, late, absent,
      attendancePct: pct,
      risk: pct !== null && pct < 75 ? 'high' : pct !== null && pct < 85 ? 'medium' : 'low',
    });
  }

  results.sort((a, b) => (a.attendancePct ?? 100) - (b.attendancePct ?? 100));
  return ApiResponse.success(res, 200, 'Student stats fetched', results);
});

const getMarksSummary = asyncHandler(async (req, res) => {
  const { sessionId, classId, subjectId } = req.query;
  if (!sessionId || !classId) return ApiResponse.error(res, 422, 'sessionId and classId are required');

  const assignments = await prisma.facultyAssignment.findMany({
    where: {
      facultyId: req.user.id, sessionId, classId, isActive: true,
      ...(subjectId ? { subjectId } : {}),
    },
    select: { subjectId: true },
  });

  const subjectIds = [...new Set(assignments.map((a) => a.subjectId))];

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

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, sessionId, isActive: true },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  });

  const seen = new Set();
  const sections = [];
  for (const a of assignments) {
    const key = `${a.classId}|${a.sectionId}`;
    if (!seen.has(key)) {
      seen.add(key);
      sections.push({ classId: a.classId, sectionId: a.sectionId, className: a.class.name, sectionName: a.section.name });
    }
  }

  const results = await Promise.all(
    sections.map(async (s) => {
      const enrollments = await prisma.enrollment.findMany({
        where: { sessionId, classId: s.classId, sectionId: s.sectionId, status: 'active' },
        select: { id: true },
      });
      const ids = enrollments.map((e) => e.id);
      const total = await prisma.attendance.count({ where: { enrollmentId: { in: ids }, subjectId: null } });
      const present = await prisma.attendance.count({
        where: { enrollmentId: { in: ids }, subjectId: null, status: { in: ['present', 'late'] } },
      });
      const pct = total > 0 ? Number(((present / total) * 100).toFixed(1)) : null;
      return { label: `${s.className} – ${s.sectionName}`, classId: s.classId, sectionId: s.sectionId, pct, totalStudents: ids.length };
    })
  );

  return ApiResponse.success(res, 200, 'Section comparison fetched', results);
});

module.exports = {
  getOverview, getDailyAttendance, getWeeklyAttendance,
  getAttendanceTrend, getStudentStats, getMarksSummary, getSectionComparison,
};