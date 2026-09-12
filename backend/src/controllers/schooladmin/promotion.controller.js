const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { promoteStudentsSchema } = require('../../validators/schooladmin.validator');
const { promoteStudents } = require('../../services/promotion.service');

// Lists current enrollments grouped by class/section, ready for the admin to assign next class
const getPromotionRoster = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const enrollments = await prisma.enrollment.findMany({
    where: { sessionId, student: { schoolId: req.schoolId, status: 'active' } },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
    orderBy: [{ class: { sortOrder: 'asc' } }, { section: { name: 'asc' } }],
  });

  return ApiResponse.success(res, 200, 'Promotion roster fetched', enrollments);
});

const runPromotion = asyncHandler(async (req, res) => {
  const data = promoteStudentsSchema.parse(req.body);

  const result = await promoteStudents({
    schoolId: req.schoolId,
    fromSessionId: data.fromSessionId,
    toSessionId: data.toSessionId,
    promotions: data.promotions,
    actorId: req.user.id,
  });

  await logAudit({
    req,
    action: 'RUN_PROMOTION',
    resourceType: 'enrollment',
    metadata: { fromSessionId: data.fromSessionId, toSessionId: data.toSessionId, result },
  });

  return ApiResponse.success(res, 200, 'Promotion completed', result);
});

module.exports = { getPromotionRoster, runPromotion };