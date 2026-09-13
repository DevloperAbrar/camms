const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createClassSchema, updateClassSchema } = require('../../validators/schooladmin.validator');

const createClass = asyncHandler(async (req, res) => {
  const data = createClassSchema.parse(req.body);

  const cls = await prisma.class.create({
    data: { schoolId: req.schoolId, sessionId: data.sessionId, name: data.name, sortOrder: data.sortOrder },
  });

  await logAudit({ req, action: 'CREATE_CLASS', resourceType: 'class', resourceId: cls.id });

  return ApiResponse.success(res, 201, 'Class created', cls);
});

const getClasses = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;

  const classes = await prisma.class.findMany({
    where: { schoolId: req.schoolId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { sortOrder: 'asc' },
    include: { sections: true },
  });

  return ApiResponse.success(res, 200, 'Classes fetched', classes);
});

const updateClass = asyncHandler(async (req, res) => {
  const data = updateClassSchema.parse(req.body);

  const cls = await prisma.class.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!cls) return ApiResponse.error(res, 404, 'Class not found');

  const updated = await prisma.class.update({ where: { id: req.params.id }, data });

  await logAudit({ req, action: 'UPDATE_CLASS', resourceType: 'class', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Class updated', updated);
});

const deleteClass = asyncHandler(async (req, res) => {
  const enrollmentExists = await prisma.enrollment.findFirst({ where: { classId: req.params.id } });
  if (enrollmentExists) {
    return ApiResponse.error(res, 409, 'Cannot delete a class that has students enrolled');
  }

  await prisma.class.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_CLASS', resourceType: 'class', resourceId: req.params.id });

  return ApiResponse.success(res, 200, 'Class deleted');
});

module.exports = { createClass, getClasses, updateClass, deleteClass };