const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { markAttendanceSchema } = require('../../validators/faculty.validator');
const { createBulkNotifications } = require('../../services/notification.service');

// ─── GET /faculty/attendance/my-assignments ──────────────────────────────────
// Returns all subject assignments for this faculty, plus class-teacher pseudo-
// entries (subject: null) for sections where they are class teacher but may not
// have a subject assignment.  Reports/Analytics use the class-teacher scope;
// attendance marking always requires a real subject assignment.
const getMyAssignments = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, ...(sessionId ? { sessionId } : {}) },
    include: {
      session: { select: { id: true, label: true, isActive: true } },
      class:   { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true } },
    },
  });

  const classTeacherSections = await prisma.section.findMany({
    where: {
      classTeacherId: req.user.id,
      ...(sessionId ? { class: { sessionId } } : {}),
    },
    include: {
      class: {
        select: {
          id: true, name: true, sessionId: true,
          session: { select: { id: true, label: true, isActive: true } },
        },
      },
    },
  });

  const classTeacherSectionIds = new Set(classTeacherSections.map((s) => s.id));

  const combined = assignments.map((a) => ({
    ...a,
    isClassTeacher: classTeacherSectionIds.has(a.sectionId),
  }));

  // Add class-teacher pseudo-entries for sections with no subject assignment
  const seen = new Set(assignments.map((a) => `${a.sessionId}|${a.classId}|${a.sectionId}`));
  for (const s of classTeacherSections) {
    const key = `${s.class.sessionId}|${s.classId}|${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push({
      id: `ct-${s.id}`,
      facultyId: req.user.id,
      sessionId: s.class.sessionId,
      classId:   s.classId,
      sectionId: s.id,
      subjectId: null,
      isActive: true,
      isClassTeacher: true,
      session: s.class.session,
      class:   { id: s.classId, name: s.class.name },
      section: { id: s.id, name: s.name },
      subject: null,
    });
  }

  return ApiResponse.success(res, 200, 'Assignments fetched', combined);
});

// ─── GET /faculty/attendance/roster ─────────────────────────────────────────
// Subject-wise attendance: each teacher marks their OWN subject.
// subjectId is REQUIRED — attendance records are keyed by (enrollmentId, subjectId, date).
const getRosterForAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, subjectId, date } = req.query;

  if (!subjectId) {
    return ApiResponse.error(res, 422, 'subjectId is required — select a subject to mark attendance');
  }

  // Strict check: faculty must be assigned to THIS subject in this class/section
  const assignment = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId: req.user.id,
      classId,
      sectionId,
      subjectId,
      sessionId,
      isActive: true,
    },
  });

  if (!assignment) {
    return ApiResponse.error(res, 403, 'You are not assigned to teach this subject in this class/section');
  }

  const dateOnly = date ? new Date(date) : null;

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active' },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true, photoUrl: true } },
      // Return existing attendance for this SUBJECT on this date (not daily/null)
      attendance: dateOnly
        ? { where: { subjectId, date: dateOnly } }
        : false,
    },
    orderBy: { rollNumber: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Roster fetched', enrollments);
});

// ─── POST /faculty/attendance/mark ──────────────────────────────────────────
// subjectId is now required — no more "daily" null attendance from faculty portal.
// Upsert per (enrollmentId, subjectId, date) so re-saves work cleanly.
const markAttendance = asyncHandler(async (req, res) => {
  const data = markAttendanceSchema.parse(req.body);

  if (!data.subjectId) {
    return ApiResponse.error(res, 422, 'subjectId is required for marking attendance');
  }

  // Verify the faculty actually teaches this subject in this class/section
  const isAssigned = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId: req.user.id,
      classId:   data.classId,
      sectionId: data.sectionId,
      subjectId: data.subjectId,
      sessionId: data.sessionId,
      isActive: true,
    },
  });

  if (!isAssigned) {
    return ApiResponse.error(res, 403, 'You are not assigned to this subject in this class/section');
  }

  const dateOnly = new Date(data.date);
  const newlyAbsentEnrollmentIds = [];

  await prisma.$transaction(async (tx) => {
    for (const r of data.records) {
      const existing = await tx.attendance.findFirst({
        where: { enrollmentId: r.enrollmentId, subjectId: data.subjectId, date: dateOnly },
      });

      if (existing) {
        if (existing.status !== r.status) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: { status: r.status, markedBy: req.user.id },
          });
        }
        if (r.status === 'absent' && existing.status !== 'absent') {
          newlyAbsentEnrollmentIds.push(r.enrollmentId);
        }
      } else {
        await tx.attendance.create({
          data: {
            enrollmentId: r.enrollmentId,
            subjectId:    data.subjectId,
            date:         dateOnly,
            status:       r.status,
            markedBy:     req.user.id,
            isLocked:     false,
          },
        });
        if (r.status === 'absent') newlyAbsentEnrollmentIds.push(r.enrollmentId);
      }
    }
  });

  // Notify parents of newly absent students
  if (newlyAbsentEnrollmentIds.length > 0) {
    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: newlyAbsentEnrollmentIds } },
      include: { student: { select: { id: true, name: true } } },
    });

    const subject = await prisma.subject.findUnique({
      where: { id: data.subjectId },
      select: { name: true },
    });

    const notifications = enrollments.map((enr) => ({
      schoolId:      req.schoolId,
      recipientType: 'parent',
      recipientRef:  enr.student.id,
      title:         'Absence recorded',
      message:       `${enr.student.name} was marked absent in ${subject?.name || 'a subject'} on ${dateOnly.toDateString()}.`,
      type:          'absentee',
    }));

    await createBulkNotifications(notifications);
  }

  await logAudit({
    req,
    action: 'MARK_ATTENDANCE',
    resourceType: 'attendance',
    metadata: {
      classId:   data.classId,
      sectionId: data.sectionId,
      subjectId: data.subjectId,
      date:      data.date,
      count:     data.records.length,
    },
  });

  return ApiResponse.success(res, 201, 'Attendance saved', { count: data.records.length });
});

// ─── GET /faculty/attendance/history ────────────────────────────────────────
const getMyAttendanceHistory = asyncHandler(async (req, res) => {
  const { classId, sectionId, subjectId, startDate, endDate } = req.query;

  const records = await prisma.attendance.findMany({
    where: {
      markedBy: req.user.id,
      ...(subjectId ? { subjectId } : {}),
      ...(startDate && endDate
        ? { date: { gte: new Date(startDate), lte: new Date(endDate) } }
        : {}),
      ...(classId || sectionId
        ? { enrollment: { ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) } }
        : {}),
    },
    include: {
      enrollment: {
        include: { student: { select: { name: true, enrollmentNumber: true } } },
      },
      subject: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Attendance history fetched', records);
});

module.exports = { getMyAssignments, getRosterForAttendance, markAttendance, getMyAttendanceHistory };