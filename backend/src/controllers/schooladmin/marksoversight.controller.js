const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { overrideMarkSchema } = require('../../validators/exam.validator');

// Admin can view any faculty-entered mark
const getMarksForExamSubject = asyncHandler(async (req, res) => {
  const marks = await prisma.marks.findMany({
    where: { examSubjectId: req.params.examSubjectId },
    include: {
      enrollment: { include: { student: { select: { name: true, enrollmentNumber: true } } } },
      faculty: { select: { name: true } },
    },
  });

  return ApiResponse.success(res, 200, 'Marks fetched', marks);
});

// Override is allowed, but never silent — mandatory reason, always logged
const overrideMark = asyncHandler(async (req, res) => {
  const { marksObtained, reason } = overrideMarkSchema.parse(req.body);

  const mark = await prisma.marks.update({
    where: { id: req.params.id },
    data: { marksObtained },
  });

  await logAudit({
    req,
    action: 'OVERRIDE_MARK',
    resourceType: 'marks',
    resourceId: mark.id,
    metadata: { newValue: marksObtained, reason },
  });

  return ApiResponse.success(res, 200, 'Mark overridden', mark);
});

module.exports = { getMarksForExamSubject, overrideMark };