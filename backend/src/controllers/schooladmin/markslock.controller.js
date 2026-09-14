const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { setMarksLockSchema } = require('../../validators/exam.validator');

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
    data: {
      isLocked: locked,
      // Store reason when unlocking so faculty can see why; clear it on re-lock
      unlockReason: locked ? null : (reason || null),
    },
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

// Bulk lock/unlock by classId — locks/unlocks ALL exam subjects for every
// exam type in that class. One click to lock an entire class after exams end.
const bulkSetByClass = asyncHandler(async (req, res) => {
  const { locked, reason, classId, sessionId } = req.body;

  if (!classId) return ApiResponse.error(res, 400, 'classId is required');
  if (!locked && !reason) return ApiResponse.error(res, 400, 'reason is required when unlocking');

  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examType: {
        schoolId: req.schoolId,
        classId,
        ...(sessionId ? { sessionId } : {}),
      },
    },
    select: { id: true },
  });

  if (examSubjects.length === 0) return ApiResponse.error(res, 404, 'No exam subjects found for this class');

  const ids = examSubjects.map((es) => es.id);

  const result = await prisma.marks.updateMany({
    where: { examSubjectId: { in: ids } },
    data: {
      isLocked: locked,
      unlockReason: locked ? null : (reason || null),
    },
  });

  await logAudit({
    req,
    action: locked ? 'BULK_LOCK_CLASS' : 'BULK_UNLOCK_CLASS',
    resourceType: 'class',
    resourceId: classId,
    metadata: { classId, sessionId, examSubjectCount: ids.length, recordsAffected: result.count, reason: reason || null },
  });

  return ApiResponse.success(res, 200, `Marks ${locked ? 'locked' : 'unlocked'} for ${result.count} record(s) across class`, {
    locked, recordsAffected: result.count,
  });
});

// Bulk lock/unlock ALL marks across ALL classes for a session — e.g. lock
// everything at the end of an academic year in one click.
const bulkSetBySession = asyncHandler(async (req, res) => {
  const { locked, reason, sessionId } = req.body;

  if (!sessionId) return ApiResponse.error(res, 400, 'sessionId is required');
  if (!locked && !reason) return ApiResponse.error(res, 400, 'reason is required when unlocking');

  const examSubjects = await prisma.examSubject.findMany({
    where: { examType: { schoolId: req.schoolId, sessionId } },
    select: { id: true },
  });

  if (examSubjects.length === 0) return ApiResponse.error(res, 404, 'No exam subjects found for this session');

  const ids = examSubjects.map((es) => es.id);

  const result = await prisma.marks.updateMany({
    where: { examSubjectId: { in: ids } },
    data: {
      isLocked: locked,
      unlockReason: locked ? null : (reason || null),
    },
  });

  await logAudit({
    req,
    action: locked ? 'BULK_LOCK_SESSION' : 'BULK_UNLOCK_SESSION',
    resourceType: 'session',
    resourceId: sessionId,
    metadata: { sessionId, examSubjectCount: ids.length, recordsAffected: result.count, reason: reason || null },
  });

  return ApiResponse.success(res, 200, `Marks ${locked ? 'locked' : 'unlocked'} for ${result.count} record(s) across session`, {
    locked, recordsAffected: result.count,
  });
});

module.exports = { getLockOverview, setLockStatus, bulkSetByClass, bulkSetBySession };