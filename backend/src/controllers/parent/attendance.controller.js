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

  const holidays = await prisma.holiday.findMany({
    where: { sessionId: enrollment.sessionId, date: { gte: startDate, lte: endDate } },
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