const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const {
  createExamTypeSchema,
  addExamSubjectSchema,
  updateExamSubjectSchema,
  forceUnlockSchema,
  copyExamConfigSchema,
  updateExamTypeSchema,
} = require('../../validators/exam.validator');

const createExamType = asyncHandler(async (req, res) => {
  const data = createExamTypeSchema.parse(req.body);

  const examType = await prisma.examType.create({
    data: {
      schoolId: req.schoolId,
      sessionId: data.sessionId,
      classId: data.classId,
      name: data.name,
      sortOrder: data.sortOrder,
      weightagePercent: data.weightagePercent,
    },
  });

  await logAudit({ req, action: 'CREATE_EXAM_TYPE', resourceType: 'exam_type', resourceId: examType.id });

  return ApiResponse.success(res, 201, 'Exam type created', examType);
});

const getExamTypes = asyncHandler(async (req, res) => {
  const { sessionId, classId } = req.query;

  const examTypes = await prisma.examType.findMany({
    where: { schoolId: req.schoolId, ...(sessionId ? { sessionId } : {}), ...(classId ? { classId } : {}) },
    include: { examSubjects: { include: { subject: { select: { name: true } } } } },
    orderBy: { sortOrder: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Exam types fetched', examTypes);
});

const addExamSubject = asyncHandler(async (req, res) => {
  const data = addExamSubjectSchema.parse(req.body);

  const examType = await prisma.examType.findUnique({ where: { id: data.examTypeId } });
  if (examType.isLocked) {
    return ApiResponse.error(res, 409, 'This exam is locked. Force-unlock is required to add subjects.');
  }

  const examSubject = await prisma.examSubject.create({ data });

  await logAudit({ req, action: 'ADD_EXAM_SUBJECT', resourceType: 'exam_subject', resourceId: examSubject.id });

  return ApiResponse.success(res, 201, 'Subject added to exam', examSubject);
});

// Blocked once marks entry has begun for this subject — that's what "locked" means
const updateExamSubject = asyncHandler(async (req, res) => {
  const data = updateExamSubjectSchema.parse(req.body);

  const examSubject = await prisma.examSubject.findUnique({ where: { id: req.params.id } });
  const hasMarks = await prisma.marks.findFirst({ where: { examSubjectId: req.params.id } });

  if (hasMarks) {
    return ApiResponse.error(res, 409, 'Cannot change max/passing marks after marks entry has begun. Use force-unlock.');
  }

  const updated = await prisma.examSubject.update({ where: { id: req.params.id }, data });

  await logAudit({ req, action: 'UPDATE_EXAM_SUBJECT', resourceType: 'exam_subject', resourceId: updated.id });

  return ApiResponse.success(res, 200, 'Exam subject updated', updated);
});

// Mandatory reason, always audit-logged — never a silent structural change
const forceUnlockExamType = asyncHandler(async (req, res) => {
  const { reason } = forceUnlockSchema.parse(req.body);

  const examType = await prisma.examType.update({
    where: { id: req.params.id },
    data: { isLocked: false },
  });

  await logAudit({
    req,
    action: 'FORCE_UNLOCK_EXAM_TYPE',
    resourceType: 'exam_type',
    resourceId: examType.id,
    metadata: { reason },
  });

  return ApiResponse.success(res, 200, 'Exam type unlocked', examType);
});

// Copies exam types + weightage + per-subject max/passing marks from one class
// into another. Subjects are matched by name (case-insensitive) since Subject
// rows are per-class — any source subject with no same-named subject in the
// target class is skipped and reported back instead of failing the whole copy.
const copyExamConfig = asyncHandler(async (req, res) => {
  const data = copyExamConfigSchema.parse(req.body);

  if (data.sourceClassId === data.targetClassId && data.sourceSessionId === data.targetSessionId) {
    return ApiResponse.error(res, 400, 'Source and target class cannot be the same.');
  }

  const sourceExamTypes = await prisma.examType.findMany({
    where: { schoolId: req.schoolId, sessionId: data.sourceSessionId, classId: data.sourceClassId },
    include: { examSubjects: { include: { subject: { select: { name: true } } } } },
    orderBy: { sortOrder: 'asc' },
  });

  if (!sourceExamTypes.length) {
    return ApiResponse.error(res, 404, 'The class you are copying from has no exam types configured yet.');
  }

  const existingTargetCount = await prisma.examType.count({
    where: { schoolId: req.schoolId, sessionId: data.targetSessionId, classId: data.targetClassId },
  });

  if (existingTargetCount > 0) {
    return ApiResponse.error(res, 409, 'This class already has exam types configured. Remove them first if you want to copy in fresh values.');
  }

  const targetSubjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId, sessionId: data.targetSessionId, classId: data.targetClassId },
  });
  const targetSubjectIdByName = new Map(targetSubjects.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const skippedSubjects = new Set();

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids = [];
    for (const sourceExamType of sourceExamTypes) {
      const newExamType = await tx.examType.create({
        data: {
          schoolId: req.schoolId,
          sessionId: data.targetSessionId,
          classId: data.targetClassId,
          name: sourceExamType.name,
          sortOrder: sourceExamType.sortOrder,
          weightagePercent: sourceExamType.weightagePercent,
        },
      });
      ids.push(newExamType.id);

      for (const examSubject of sourceExamType.examSubjects) {
        const targetSubjectId = targetSubjectIdByName.get(examSubject.subject.name.trim().toLowerCase());
        if (!targetSubjectId) {
          skippedSubjects.add(examSubject.subject.name);
          continue;
        }
        await tx.examSubject.create({
          data: {
            examTypeId: newExamType.id,
            subjectId: targetSubjectId,
            maxMarks: examSubject.maxMarks,
            passingMarks: examSubject.passingMarks,
          },
        });
      }
    }
    return ids;
  });

  const examTypes = await prisma.examType.findMany({
    where: { id: { in: createdIds } },
    include: { examSubjects: { include: { subject: { select: { name: true } } } } },
    orderBy: { sortOrder: 'asc' },
  });

  await logAudit({
    req,
    action: 'COPY_EXAM_CONFIG',
    resourceType: 'exam_type',
    resourceId: null,
    metadata: { ...data, examTypesCopied: examTypes.length, skippedSubjects: Array.from(skippedSubjects) },
  });

  return ApiResponse.success(res, 201, 'Exam configuration copied', {
    examTypes,
    skippedSubjects: Array.from(skippedSubjects),
  });
});

// Renaming/reordering/re-weighting is safe even after marks entry — it doesn't
// touch subjects or marks. Structural changes (subjects, max/passing) stay
// gated behind addExamSubject/updateExamSubject's own marks checks.
const updateExamType = asyncHandler(async (req, res) => {
  const data = updateExamTypeSchema.parse(req.body);

  const existing = await prisma.examType.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) {
    return ApiResponse.error(res, 404, 'Exam type not found.');
  }

  const updated = await prisma.examType.update({ where: { id: req.params.id }, data });

  await logAudit({ req, action: 'UPDATE_EXAM_TYPE', resourceType: 'exam_type', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Exam type updated', updated);
});

// Blocked once any marks have been entered under this exam type — deleting
// would silently cascade-delete those marks via ExamSubject -> Marks.
const deleteExamType = asyncHandler(async (req, res) => {
  const existing = await prisma.examType.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) {
    return ApiResponse.error(res, 404, 'Exam type not found.');
  }

  const hasMarks = await prisma.marks.findFirst({ where: { examSubject: { examTypeId: req.params.id } } });
  if (hasMarks) {
    return ApiResponse.error(res, 409, 'Cannot delete — marks have already been entered under this exam type.');
  }

  await prisma.examType.delete({ where: { id: req.params.id } });

  await logAudit({ req, action: 'DELETE_EXAM_TYPE', resourceType: 'exam_type', resourceId: req.params.id, metadata: { name: existing.name } });

  return ApiResponse.success(res, 200, 'Exam type deleted', { id: req.params.id });
});

module.exports = {
  createExamType,
  getExamTypes,
  addExamSubject,
  updateExamSubject,
  forceUnlockExamType,
  copyExamConfig,
  updateExamType,
  deleteExamType,
};