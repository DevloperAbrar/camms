const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { setMarksLockSchema } = require('../../validators/exam.validator');

// Powers the admin "Marks Lock" screen: pick session/class/subject/exam type,
// see exactly how many marks are locked vs unlocked per exam-subject, and
// flip the lock in bulk. This is the single source of truth for whether
// faculty can edit a submitted mark — see faculty/marks.controller.js#enterMarks.
const getLockOverview = asyncHandler(async (req, res) => {
  const { sessionId, classId, subjectId, examTypeId } = req.query;

  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examType: {
        schoolId: req.schoolId,
        ...(sessionId ? { sessionId } : {}),
        ...(classId ? { classId } : {}),
        ...(examTypeId ? { id: examTypeId } : {}),
      },
      ...(subjectId ? { subjectId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true } },
      examType: {
        select: {
          id: true, name: true, sortOrder: true,
          class: { select: { id: true, name: true } },
          session: { select: { id: true, label: true, isActive: true } },
        },
      },
      marks: { select: { isLocked: true } },
    },
    orderBy: [{ examType: { sortOrder: 'asc' } }],
  });

  const result = examSubjects.map((es) => {
    const total = es.marks.length;
    const lockedCount = es.marks.filter((m) => m.isLocked).length;
    return {
      examSubjectId: es.id,
      subject: es.subject,
      examType: es.examType,
      maxMarks: es.maxMarks,
      passingMarks: es.passingMarks,
      totalMarksEntered: total,
      lockedCount,
      unlockedCount: total - lockedCount,
      status: total === 0 ? 'no_marks' : lockedCount === total ? 'locked' : lockedCount === 0 ? 'unlocked' : 'partial',
    };
  });

  return ApiResponse.success(res, 200, 'Marks lock overview fetched', result);
});

// Bulk lock/unlock every submitted mark under one exam-subject in a single
// transaction. Unlocking always requires a reason and is always audit-logged —
// this directly controls whether faculty can resubmit via enterMarks.
const setLockStatus = asyncHandler(async (req, res) => {
  const { locked, reason } = setMarksLockSchema.parse(req.body);
  const { examSubjectId } = req.params;

  const examSubject = await prisma.examSubject.findFirst({
    where: { id: examSubjectId, examType: { schoolId: req.schoolId } },
    include: { subject: { select: { name: true } }, examType: { select: { name: true } } },
  });

  if (!examSubject) return ApiResponse.error(res, 404, 'Exam subject not found');

  const result = await prisma.marks.updateMany({
    where: { examSubjectId },
    data: { isLocked: locked },
  });

  await logAudit({
    req,
    action: locked ? 'LOCK_MARKS' : 'UNLOCK_MARKS',
    resourceType: 'exam_subject',
    resourceId: examSubjectId,
    metadata: {
      subject: examSubject.subject.name,
      examType: examSubject.examType.name,
      recordsAffected: result.count,
      reason: reason || null,
    },
  });

  return ApiResponse.success(res, 200, `Marks ${locked ? 'locked' : 'unlocked'} for ${result.count} student(s)`, {
    examSubjectId,
    locked,
    recordsAffected: result.count,
  });
});

module.exports = { getLockOverview, setLockStatus };