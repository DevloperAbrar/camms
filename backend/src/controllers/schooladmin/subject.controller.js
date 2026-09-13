const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createSubjectSchema, updateSubjectSchema, copySubjectsSchema } = require('../../validators/schooladmin.validator');

const createSubject = asyncHandler(async (req, res) => {
  const data = createSubjectSchema.parse(req.body);

  const subject = await prisma.subject.create({
    data: { schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId, name: data.name, code: data.code },
  });

  await logAudit({ req, action: 'CREATE_SUBJECT', resourceType: 'subject', resourceId: subject.id });

  return ApiResponse.success(res, 201, 'Subject created', subject);
});

const getSubjects = asyncHandler(async (req, res) => {
  const { sessionId, classId } = req.query;

  const subjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId, ...(sessionId ? { sessionId } : {}), ...(classId ? { classId } : {}) },
  });

  return ApiResponse.success(res, 200, 'Subjects fetched', subjects);
});

const updateSubject = asyncHandler(async (req, res) => {
  const data = updateSubjectSchema.parse(req.body);

  const subject = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!subject) return ApiResponse.error(res, 404, 'Subject not found');

  const updated = await prisma.subject.update({ where: { id: req.params.id }, data });

  await logAudit({ req, action: 'UPDATE_SUBJECT', resourceType: 'subject', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Subject updated', updated);
});

// "Copy subjects from previous session" — avoids re-typing the same list every year
const copySubjects = asyncHandler(async (req, res) => {
  const data = copySubjectsSchema.parse(req.body);

  const sourceSubjects = await prisma.subject.findMany({
    where: { schoolId: req.schoolId, sessionId: data.fromSessionId, classId: data.fromClassId },
  });

  if (sourceSubjects.length === 0) {
    return ApiResponse.error(res, 404, 'No subjects found in the source class/session to copy');
  }

  const created = await prisma.$transaction(
    sourceSubjects.map((s) =>
      prisma.subject.create({
        data: { schoolId: req.schoolId, sessionId: data.toSessionId, classId: data.toClassId, name: s.name, code: s.code },
      })
    )
  );

  await logAudit({ req, action: 'COPY_SUBJECTS', resourceType: 'subject', metadata: { count: created.length } });

  return ApiResponse.success(res, 201, `${created.length} subjects copied`, created);
});

const deleteSubject = asyncHandler(async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_SUBJECT', resourceType: 'subject', resourceId: req.params.id });
  return ApiResponse.success(res, 200, 'Subject deleted');
});

module.exports = { createSubject, getSubjects, updateSubject, copySubjects, deleteSubject };