const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { reviewCorrectionSchema } = require('../../validators/exam.validator');

// CorrectionRequest has no schoolId column of its own -- it's scoped through
// requestedBy, which is always the faculty user who filed it, and every
// faculty user belongs to exactly one school. Without this, any school admin
// could see and act on every other school's correction requests.
const getCorrectionRequests = asyncHandler(async (req, res) => {
  const { status, type } = req.query;

  const schoolUsers = await prisma.user.findMany({
    where: { schoolId: req.schoolId },
    select: { id: true },
  });
  const schoolUserIds = schoolUsers.map((u) => u.id);

  const requests = await prisma.correctionRequest.findMany({
    where: {
      requestedBy: { in: schoolUserIds },
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Correction requests fetched', requests);
});

// Admin approves -> the actual change is applied here; rejects -> nothing changes
const reviewCorrectionRequest = asyncHandler(async (req, res) => {
  const { status, reviewNote } = reviewCorrectionSchema.parse(req.body);

  const request = await prisma.correctionRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return ApiResponse.error(res, 404, 'Correction request not found');

  // Tenant check: the faculty who filed this request must belong to this admin's school.
  // Treat a cross-tenant request exactly like "not found" -- never reveal it exists.
  const requester = await prisma.user.findUnique({
    where: { id: request.requestedBy },
    select: { schoolId: true },
  });
  if (!requester || requester.schoolId !== req.schoolId) {
    return ApiResponse.error(res, 404, 'Correction request not found');
  }

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