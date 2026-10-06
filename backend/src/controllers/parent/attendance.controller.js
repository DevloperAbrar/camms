const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

// Calendar view: present/absent/late per day for a given month
const getAttendanceCalendar = asyncHandler(async (req, res) => {
  const { month, year } = req.query; // month is 1-12

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: req.student.id, session: { isActive: true } },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'No active enrollment found for this student');

  const startDate = new Date(Number(year), Number(month) - 1, 1);
  const endDate = new Date(Number(year), Number(month), 0);

  const records = await prisma.attendance.findMany({
    where: { enrollmentId: enrollment.id, date: { gte: startDate, lte: endDate } },
    include: { subject: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  // Holidays now come from the academic calendar (whole-school or this child's class)
  const monthStart = `${Number(year)}-${String(Number(month)).padStart(2, '0')}-01`;
  const monthEnd = new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10);

  const holidayEvents = await prisma.calendarEvent.findMany({
    where: {
      schoolId: req.student.schoolId,
      sessionId: enrollment.sessionId,
      kind: 'holiday',
      audience: 'all',
      startDate: { lte: new Date(`${monthEnd}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${monthStart}T00:00:00.000Z`) },
      OR: [{ classIds: { isEmpty: true } }, { classIds: { has: enrollment.classId } }],
    },
  });

  const holidays = [];
  holidayEvents.forEach((e) => {
    const from = e.startDate.toISOString().slice(0, 10);
    const to = e.endDate.toISOString().slice(0, 10);
    for (let d = from > monthStart ? from : monthStart; d <= (to < monthEnd ? to : monthEnd); ) {
      holidays.push({ date: new Date(`${d}T00:00:00.000Z`).toISOString(), description: e.title });
      d = new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86400000).toISOString().slice(0, 10);
    }
  });

  const totalDays = records.length;
  const presentDays = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const monthlyPercentage = totalDays > 0 ? Number(((presentDays / totalDays) * 100).toFixed(2)) : 100;

  return ApiResponse.success(res, 200, 'Attendance calendar fetched', {
    records,
    holidays,
    monthlyPercentage,
    totalDays,
    presentDays,
  });
});

// Subject-wise breakdown for schools using subject-wise attendance mode
const getSubjectWiseAttendance = asyncHandler(async (req, res) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: req.student.id, session: { isActive: true } },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'No active enrollment found for this student');

  const subjects = await prisma.subject.findMany({ where: { classId: enrollment.classId } });

  const breakdown = await Promise.all(
    subjects.map(async (subject) => {
      const total = await prisma.attendance.count({ where: { enrollmentId: enrollment.id, subjectId: subject.id } });
      const present = await prisma.attendance.count({
        where: { enrollmentId: enrollment.id, subjectId: subject.id, status: { in: ['present', 'late'] } },
      });

      return {
        subject: subject.name,
        totalClasses: total,
        present,
        percentage: total > 0 ? Number(((present / total) * 100).toFixed(2)) : 100,
      };
    })
  );

  return ApiResponse.success(res, 200, 'Subject-wise attendance fetched', breakdown);
});

module.exports = { getAttendanceCalendar, getSubjectWiseAttendance };