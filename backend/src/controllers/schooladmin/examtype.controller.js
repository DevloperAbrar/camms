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
  copyExamSubjectsSchema,
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
// into another. Subjects are matched by name (case-insensitive).
// NEW BEHAVIOUR: if a subject exists in the source but NOT in the target class,
// it is auto-created in the target class (same session) so that marks copy
// completely without any manual subject setup beforehand.
const copyExamConfig = asyncHandler(async (req, res) => {
  const data = copyExamConfigSchema.parse(req.body);

  if (data.sourceClassId === data.targetClassId && data.sourceSessionId === data.targetSessionId) {
    return ApiResponse.error(res, 400, 'Source and target class cannot be the same.');
  }

  // Fetch source class's session info to get the target session's id for subject creation
  const sourceExamTypes = await prisma.examType.findMany({
    where: { schoolId: req.schoolId, sessionId: data.sourceSessionId, classId: data.sourceClassId },
    include: { examSubjects: { include: { subject: true } } },
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

  // Collect all unique subjects from source exam types
  const sourceSubjectMap = new Map(); // name.lowercase -> { name, code }
  for (const et of sourceExamTypes) {
    for (const es of et.examSubjects) {
      const key = es.subject.name.trim().toLowerCase();
      if (!sourceSubjectMap.has(key)) {
        sourceSubjectMap.set(key, { name: es.subject.name.trim(), code: es.subject.code || null });
      }
    }
  }

  // Fetch existing subjects in target class
  const existingTargetSubjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId, sessionId: data.targetSessionId, classId: data.targetClassId },
  });
  const targetSubjectIdByName = new Map(existingTargetSubjects.map((s) => [s.name.trim().toLowerCase(), s.id]));

  // Figure out which subjects need to be auto-created
  const subjectsToCreate = [];
  for (const [key, subjectData] of sourceSubjectMap.entries()) {
    if (!targetSubjectIdByName.has(key)) {
      subjectsToCreate.push(subjectData);
    }
  }

  const autoCreatedSubjects = [];
  const createdIds = await prisma.$transaction(async (tx) => {
    // Auto-create missing subjects in target class
    for (const subjectData of subjectsToCreate) {
      const newSubject = await tx.subject.create({
        data: {
          schoolId: req.schoolId,
          sessionId: data.targetSessionId,
          classId: data.targetClassId,
          name: subjectData.name,
          code: subjectData.code,
        },
      });
      targetSubjectIdByName.set(subjectData.name.toLowerCase(), newSubject.id);
      autoCreatedSubjects.push(subjectData.name);
    }

    // Now copy exam types + subjects
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
        if (!targetSubjectId) continue; // should never happen now
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
    metadata: { ...data, examTypesCopied: examTypes.length, autoCreatedSubjects },
  });

  return ApiResponse.success(res, 201, 'Exam configuration copied', {
    examTypes,
    autoCreatedSubjects,
    skippedSubjects: [], // nothing skipped anymore — subjects are auto-created
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

// Bulk-copy subjects + marks INTO a specific exam type from another exam type
// (e.g. copy "Periodic Test 1" of Class 6 into "Periodic Test 1" of Class 7).
// Called from the Manage modal — the target exam type is req.params.id.
// Subjects are matched by name; missing ones are auto-created in the target class.
// Existing subjects in the target exam type are left untouched (no double-add).
const copyExamSubjects = asyncHandler(async (req, res) => {
  const { sourceExamTypeId } = copyExamSubjectsSchema.parse(req.body);
  const targetExamTypeId = req.params.id;

  if (sourceExamTypeId === targetExamTypeId) {
    return ApiResponse.error(res, 400, 'Source and target exam type cannot be the same.');
  }

  // Load target exam type (must belong to this school)
  const targetExamType = await prisma.examType.findFirst({
    where: { id: targetExamTypeId, schoolId: req.schoolId },
    include: { examSubjects: { include: { subject: true } } },
  });
  if (!targetExamType) return ApiResponse.error(res, 404, 'Target exam type not found.');
  if (targetExamType.isLocked) return ApiResponse.error(res, 409, 'Target exam is locked. Force-unlock it first.');

  // Load source exam type (must also belong to this school)
  const sourceExamType = await prisma.examType.findFirst({
    where: { id: sourceExamTypeId, schoolId: req.schoolId },
    include: { examSubjects: { include: { subject: true } } },
  });
  if (!sourceExamType) return ApiResponse.error(res, 404, 'Source exam type not found.');
  if (!sourceExamType.examSubjects.length) {
    return ApiResponse.error(res, 404, 'The source exam type has no subjects configured yet.');
  }

  // Subjects already in target exam — skip them to avoid duplicates
  const alreadyAddedSubjectIds = new Set(targetExamType.examSubjects.map((es) => es.subjectId));

  // Fetch existing subjects in the target class for name-based matching
  const targetClassSubjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId, sessionId: targetExamType.sessionId, classId: targetExamType.classId },
  });
  const targetSubjectIdByName = new Map(targetClassSubjects.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const autoCreatedSubjects = [];
  const addedSubjects = [];

  await prisma.$transaction(async (tx) => {
    for (const es of sourceExamType.examSubjects) {
      const nameKey = es.subject.name.trim().toLowerCase();

      // Auto-create subject in target class if missing
      let targetSubjectId = targetSubjectIdByName.get(nameKey);
      if (!targetSubjectId) {
        const newSubject = await tx.subject.create({
          data: {
            schoolId: req.schoolId,
            sessionId: targetExamType.sessionId,
            classId: targetExamType.classId,
            name: es.subject.name.trim(),
            code: es.subject.code || null,
          },
        });
        targetSubjectId = newSubject.id;
        targetSubjectIdByName.set(nameKey, targetSubjectId);
        autoCreatedSubjects.push(es.subject.name.trim());
      }

      // Skip if this subject is already in target exam
      if (alreadyAddedSubjectIds.has(targetSubjectId)) continue;

      await tx.examSubject.create({
        data: {
          examTypeId: targetExamTypeId,
          subjectId: targetSubjectId,
          maxMarks: es.maxMarks,
          passingMarks: es.passingMarks,
        },
      });
      addedSubjects.push(es.subject.name.trim());
    }
  });

  // Return updated exam type with all subjects
  const updated = await prisma.examType.findUnique({
    where: { id: targetExamTypeId },
    include: { examSubjects: { include: { subject: { select: { name: true } } } } },
  });

  await logAudit({
    req,
    action: 'COPY_EXAM_SUBJECTS',
    resourceType: 'exam_type',
    resourceId: targetExamTypeId,
    metadata: { sourceExamTypeId, addedSubjects, autoCreatedSubjects },
  });

  return ApiResponse.success(res, 200, 'Subjects copied into exam type', {
    examType: updated,
    addedSubjects,
    autoCreatedSubjects,
  });
});

module.exports = {
  createExamType,
  getExamTypes,
  addExamSubject,
  updateExamSubject,
  forceUnlockExamType,
  copyExamConfig,
  copyExamSubjects,
  updateExamType,
  deleteExamType,
};