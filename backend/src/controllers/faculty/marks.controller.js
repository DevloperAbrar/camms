const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { enterMarksSchema } = require('../../validators/faculty.validator');
const { verifyFacultyCanEnterMarks } = require('../../services/marks.service');
const { createBulkNotifications } = require('../../services/notification.service');

// Faculty sees only the exam types/subjects already configured by admin for their assignment
const getMyExamSubjects = asyncHandler(async (req, res) => {
  const { sessionId, classId, subjectId } = req.query;

  const isAssigned = await prisma.facultyAssignment.findFirst({
    where: { facultyId: req.user.id, sessionId, classId, subjectId, isActive: true },
  });

  if (!isAssigned) return ApiResponse.error(res, 403, 'You are not assigned to this class/subject');

  const examSubjects = await prisma.examSubject.findMany({
    where: { subjectId, examType: { sessionId, classId } },
    include: { examType: { select: { name: true } }, subject: { select: { name: true } } },
  });

  return ApiResponse.success(res, 200, 'Exam subjects fetched', examSubjects);
});

const getRosterForMarks = asyncHandler(async (req, res) => {
  const { examSubjectId } = req.query;

  const check = await verifyFacultyCanEnterMarks({ facultyId: req.user.id, examSubjectId });
  if (!check.allowed) return ApiResponse.error(res, 403, check.reason);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId: check.examSubject.examType.sessionId,
      classId: check.examSubject.examType.classId,
      status: 'active',
    },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true } },
      marks: { where: { examSubjectId } },
    },
    orderBy: { rollNumber: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Roster fetched', {
    maxMarks: check.examSubject.maxMarks,
    passingMarks: check.examSubject.passingMarks,
    enrollments,
  });
});

// Upsert: creates marks for students who don't have one yet, and updates
// marks for students whose record the school admin has unlocked
// (isLocked: false via the Marks Lock screen). Any student whose mark is
// still locked is rejected outright. Every record saved here is (re)locked
// immediately — matching the original "submit = locked" behaviour — so the
// admin remains the only one who can unlock it again for a further edit.
const enterMarks = asyncHandler(async (req, res) => {
  const data = enterMarksSchema.parse(req.body);

  const check = await verifyFacultyCanEnterMarks({ facultyId: req.user.id, examSubjectId: data.examSubjectId });
  if (!check.allowed) return ApiResponse.error(res, 403, check.reason);

  const maxMarks = Number(check.examSubject.maxMarks);
  const invalidRecords = data.records.filter((r) => r.marksObtained > maxMarks);

  if (invalidRecords.length > 0) {
    return ApiResponse.error(res, 422, `Marks cannot exceed max marks (${maxMarks})`, invalidRecords);
  }

  const existing = await prisma.marks.findMany({
    where: { examSubjectId: data.examSubjectId, enrollmentId: { in: data.records.map((r) => r.enrollmentId) } },
  });
  const existingByEnrollment = new Map(existing.map((m) => [m.enrollmentId, m]));

  const stillLocked = data.records.filter((r) => {
    const mark = existingByEnrollment.get(r.enrollmentId);
    return mark && mark.isLocked;
  });

  if (stillLocked.length > 0) {
    return ApiResponse.error(
      res,
      409,
      'Marks for some students are locked. Ask your school admin to unlock this exam/subject before resubmitting.',
      stillLocked.map((r) => r.enrollmentId)
    );
  }

  const results = await prisma.$transaction(
    data.records.map((r) => {
      const mark = existingByEnrollment.get(r.enrollmentId);
      if (mark) {
        return prisma.marks.update({
          where: { id: mark.id },
          data: { marksObtained: r.marksObtained, enteredBy: req.user.id, isLocked: true, submittedAt: new Date() },
        });
      }
      return prisma.marks.create({
        data: {
          enrollmentId: r.enrollmentId,
          examSubjectId: data.examSubjectId,
          marksObtained: r.marksObtained,
          enteredBy: req.user.id,
          isLocked: true,
        },
      });
    })
  );

  const newlyCreatedIds = data.records
    .filter((r) => !existingByEnrollment.has(r.enrollmentId))
    .map((r) => r.enrollmentId);

  if (newlyCreatedIds.length > 0) {
    const enrollmentsWithStudents = await prisma.enrollment.findMany({
      where: { id: { in: newlyCreatedIds } },
      include: { student: { select: { id: true, name: true } } },
    });

    const notifications = enrollmentsWithStudents.map((enr) => ({
      schoolId: req.schoolId,
      recipientType: 'parent',
      recipientRef: enr.student.id,
      title: 'Marks published',
      message: `New marks have been published for ${enr.student.name}.`,
      type: 'marks_published',
    }));

    await createBulkNotifications(notifications);
  }

  await logAudit({
    req,
    action: 'ENTER_MARKS',
    resourceType: 'marks',
    metadata: { examSubjectId: data.examSubjectId, count: results.length },
  });

  return ApiResponse.success(res, 201, 'Marks submitted and locked', { count: results.length });
});

// Scoped analytics: this faculty's own sections/classes only
const getMyClassAverage = asyncHandler(async (req, res) => {
  const { examSubjectId } = req.query;

  const check = await verifyFacultyCanEnterMarks({ facultyId: req.user.id, examSubjectId });
  if (!check.allowed) return ApiResponse.error(res, 403, check.reason);

  const marks = await prisma.marks.findMany({
    where: { examSubjectId },
    include: { enrollment: { include: { student: { select: { name: true } } } } },
    orderBy: { marksObtained: 'desc' },
  });

  const values = marks.map((m) => Number(m.marksObtained));
  const average = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0;

  return ApiResponse.success(res, 200, 'Class average fetched', {
    average,
    topPerformers: marks.slice(0, 5),
    bottomPerformers: marks.slice(-5).reverse(),
  });
});

module.exports = { getMyExamSubjects, getRosterForMarks, enterMarks, getMyClassAverage };