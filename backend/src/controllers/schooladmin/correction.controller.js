const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { reviewCorrectionSchema } = require('../../validators/exam.validator');

const getCorrectionRequests = asyncHandler(async (req, res) => {
  const { status, type } = req.query;

  const requests = await prisma.correctionRequest.findMany({
    where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
    orderBy: { createdAt: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Correction requests fetched', requests);
});

// Admin approves → the actual change is applied here; rejects → nothing changes
const reviewCorrectionRequest = asyncHandler(async (req, res) => {
  const { status, reviewNote } = reviewCorrectionSchema.parse(req.body);

  const request = await prisma.correctionRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return ApiResponse.error(res, 404, 'Correction request not found');

  if (status === 'approved') {
    if (request.type === 'attendance') {
      await prisma.attendance.update({ where: { id: request.referenceId }, data: { isLocked: false } });
    } else if (request.type === 'marks') {
      await prisma.marks.update({ where: { id: request.referenceId }, data: { isLocked: false } });
    }
  }

  const updated = await prisma.correctionRequest.update({
    where: { id: req.params.id },
    data: { status, reviewedBy: req.user.id, reviewedAt: new Date() },
  });

  await logAudit({
    req,
    action: `${status.toUpperCase()}_CORRECTION_REQUEST`,
    resourceType: 'correction_request',
    resourceId: updated.id,
    metadata: { reviewNote },
  });

  return ApiResponse.success(res, 200, `Correction request ${status}`, updated);
});

module.exports = { getCorrectionRequests, reviewCorrectionRequest };