const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { markAttendanceSchema } = require('../../validators/faculty.validator');
const { verifyFacultyAssignment } = require('../../services/attendance.service');
const { createNotification, createBulkNotifications } = require('../../services/notification.service');

// Only combinations assigned to this faculty are returned — screen filters itself
const getMyAssignments = asyncHandler(async (req, res111x) => {
  const { sessionId } = req.query;

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, ...(sessionId ? { sessionId } : {}) },
    include: {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  return ApiResponse.success(res, 200, 'Assignments fetched', assignments);
});

const getRosterForAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId } = req.query;

  const allowed = await verifyFacultyAssignment({
    facultyId: req.user.id,
    classId,
    sectionId,
    subjectId: null,
    sessionId,
  });

  if (!allowed) {
    // Even without subject filter, verify at least one assignment exists for this class/section
    const anyAssignment = await prisma.facultyAssignment.findFirst({
      where: { facultyId: req.user.id, classId, sectionId, sessionId, isActive: true },
    });
    if (!anyAssignment) return ApiResponse.error(res, 403, 'You are not assigned to this class/section');
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active' },
    include: { student: { select: { id: true, name: true, enrollmentNumber: true, photoUrl: true } } },
    orderBy: { rollNumber: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Roster fetched', enrollments);
});

// Submitting attendance locks it immediately — no direct edits after this
const markAttendance = asyncHandler(async (req, res) => {
  const data = markAttendanceSchema.parse(req.body);

  const isAssigned = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId: req.user.id,
      classId: data.classId,
      sectionId: data.sectionId,
      sessionId: data.sessionId,
      isActive: true,
      ...(data.subjectId ? { subjectId: data.subjectId } : {}),
    },
  });

  if (!isAssigned) {
    return ApiResponse.error(res, 403, 'You are not assigned to this class/section/subject');
  }

  const dateOnly = new Date(data.date);

  const existing = await prisma.attendance.findFirst({
    where: { enrollmentId: data.records[0].enrollmentId, subjectId: data.subjectId || null, date: dateOnly },
  });

  if (existing) {
    return ApiResponse.error(res, 409, 'Attendance for this date has already been submitted. Use a correction request to change it.');
  }

  const created = await prisma.$transaction(
    data.records.map((r) =>
      prisma.attendance.create({
        data: {
          enrollmentId: r.enrollmentId,
          subjectId: data.subjectId || null,
          date: dateOnly,
          status: r.status,
          markedBy: req.user.id,
          isLocked: true,
        },
      })
    )
  );

  // Absentee same-day alert — in-app notification for each absent student's parent
  const absentRecords = data.records.filter((r) => r.status === 'absent');

  if (absentRecords.length > 0) {
    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: absentRecords.map((r) => r.enrollmentId) } },
      include: { student: { select: { id: true, name: true } } },
    });

    const notifications = enrollments.map((enr) => ({
      schoolId: req.schoolId,
      recipientType: 'parent',
      recipientRef: enr.student.id,
      title: 'Absence recorded',
      message: `${enr.student.name} was marked absent on ${dateOnly.toDateString()}.`,
      type: 'absentee',
    }));

    await createBulkNotifications(notifications);
  }

  await logAudit({
    req,
    action: 'MARK_ATTENDANCE',
    resourceType: 'attendance',
    metadata: { classId: data.classId, sectionId: data.sectionId, date: data.date, count: created.length },
  });

  return ApiResponse.success(res, 201, 'Attendance submitted and locked', { count: created.length });
});

const getMyAttendanceHistory = asyncHandler(async (req, res) => {
  const { classId, sectionId, subjectId, startDate, endDate } = req.query;

  const records = await prisma.attendance.findMany({
    where: {
      markedBy: req.user.id,
      ...(subjectId ? { subjectId } : {}),
      ...(startDate && endDate ? { date: { gte: new Date(startDate), lte: new Date(endDate) } } : {}),
      ...(classId || sectionId
        ? { enrollment: { ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) } }
        : {}),
    },
    include: {
      enrollment: { include: { student: { select: { name: true, enrollmentNumber: true } } } },
    },
    orderBy: { date: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Attendance history fetched', records);
});

module.exports = { getMyAssignments, getRosterForAttendance, markAttendance, getMyAttendanceHistory };