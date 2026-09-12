const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createSectionSchema } = require('../../validators/schooladmin.validator');

const createSection = asyncHandler(async (req, res) => {
  const data = createSectionSchema.parse(req.body);

  const section = await prisma.section.create({
    data: {
      schoolId: req.schoolId,
      classId: data.classId,
      name: data.name,
      classTeacherId: data.classTeacherId || null,
    },
  });

  await logAudit({ req, action: 'CREATE_SECTION', resourceType: 'section', resourceId: section.id });

  return ApiResponse.success(res, 201, 'Section created', section);
});

const updateSection = asyncHandler(async (req, res) => {
  const data = createSectionSchema.partial().parse(req.body);

  const section = await prisma.section.update({
    where: { id: req.params.id },
    data,
  });

  await logAudit({ req, action: 'UPDATE_SECTION', resourceType: 'section', resourceId: section.id });

  return ApiResponse.success(res, 200, 'Section updated', section);
});

const deleteSection = asyncHandler(async (req, res) => {
  const enrollmentExists = await prisma.enrollment.findFirst({ where: { sectionId: req.params.id } });
  if (enrollmentExists) {
    return ApiResponse.error(res, 409, 'Cannot delete a section that has students enrolled');
  }

  await prisma.section.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_SECTION', resourceType: 'section', resourceId: req.params.id });

  return ApiResponse.success(res, 200, 'Section deleted');
});

module.exports = { createSection, updateSection, deleteSection };