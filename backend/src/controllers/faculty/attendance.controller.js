const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { markAttendanceSchema } = require('../../validators/faculty.validator');
const { verifyFacultyAssignment } = require('../../services/attendance.service');
const { createBulkNotifications } = require('../../services/notification.service');

// Combinations assigned to this faculty, PLUS any section where they are the
// Class Teacher (even without a subject assignment there) — class teachers get
// a read-only "all subjects" view/report scope for their section (see
// analytics.controller.js and reports.controller.js), while marking attendance
// or entering marks still requires an actual FacultyAssignment row.
const getMyAssignments = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, ...(sessionId ? { sessionId } : {}) },
    include: {
      session: { select: { id: true, label: true, isActive: true } },
      class: { select: { id: true, name: true } },
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
        select: { id: true, name: true, sessionId: true, session: { select: { id: true, label: true, isActive: true } } },
      },
    },
  });

  const classTeacherSectionIds = new Set(classTeacherSections.map((s) => s.id));

  const combined = assignments.map((a) => ({
    ...a,
    isClassTeacher: classTeacherSectionIds.has(a.sectionId),
  }));

  const seen = new Set(assignments.map((a) => `${a.sessionId}|${a.classId}|${a.sectionId}`));
  for (const s of classTeacherSections) {
    const key = `${s.class.sessionId}|${s.classId}|${s.id}`;
    if (seen.has(key)) continue; // already covered by a real subject assignment
    seen.add(key);
    combined.push({
      id: `ct-${s.id}`,
      facultyId: req.user.id,
      sessionId: s.class.sessionId,
      classId: s.classId,
      sectionId: s.id,
      subjectId: null,
      isActive: true,
      isClassTeacher: true,
      session: s.class.session,
      class: { id: s.classId, name: s.class.name },
      section: { id: s.id, name: s.name },
      subject: null, // no single subject — class teacher sees ALL subjects here
    });
  }

  return ApiResponse.success(res, 200, 'Assignments fetched', combined);
});

const getRosterForAttendance = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, date } = req.query;

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

  const dateOnly = date ? new Date(date) : null;

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active' },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true, photoUrl: true } },
      attendance: dateOnly ? { where: { subjectId: null, date: dateOnly } } : false,
    },
    orderBy: { rollNumber: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Roster fetched', enrollments);
});

// Faculty can freely re-mark attendance for the same date — updates the existing
// record instead of rejecting it, so mistakes can be corrected without a separate flow.
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
  const subjectFilter = data.subjectId || null;

  const newlyAbsentEnrollmentIds = [];

  await prisma.$transaction(async (tx) => {
    for (const r of data.records) {
      const existing = await tx.attendance.findFirst({
        where: { enrollmentId: r.enrollmentId, subjectId: subjectFilter, date: dateOnly },
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
            subjectId: subjectFilter,
            date: dateOnly,
            status: r.status,
            markedBy: req.user.id,
            isLocked: false,
          },
        });
        if (r.status === 'absent') newlyAbsentEnrollmentIds.push(r.enrollmentId);
      }
    }
  });

  // Absentee same-day alert — only for students newly marked absent, so editing
  // and re-saving doesn't spam parents with repeat notifications.
  if (newlyAbsentEnrollmentIds.length > 0) {
    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: newlyAbsentEnrollmentIds } },
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
    metadata: { classId: data.classId, sectionId: data.sectionId, date: data.date, count: data.records.length },
  });

  return ApiResponse.success(res, 201, 'Attendance saved', { count: data.records.length });
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