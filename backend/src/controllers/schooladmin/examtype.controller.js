const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const {
  createExamTypeSchema,
  addExamSubjectSchema,
  updateExamSubjectSchema,
  forceUnlockSchema,
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

module.exports = { createExamType, getExamTypes, addExamSubject, updateExamSubject, forceUnlockExamType };