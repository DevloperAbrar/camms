const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { requestCorrectionSchema } = require('../../validators/faculty.validator');

// The only way to change locked attendance/marks — goes to admin's queue
const requestCorrection = asyncHandler(async (req, res) => {
  const data = requestCorrectionSchema.parse(req.body);

  if (data.type === 'attendance') {
    const record = await prisma.attendance.findUnique({ where: { id: data.referenceId } });
    if (!record || record.markedBy !== req.user.id) {
      return ApiResponse.error(res, 403, 'You can only request corrections for records you submitted');
    }
  } else {
    const record = await prisma.marks.findUnique({ where: { id: data.referenceId } });
    if (!record || record.enteredBy !== req.user.id) {
      return ApiResponse.error(res, 403, 'You can only request corrections for records you submitted');
    }
  }

  const request = await prisma.correctionRequest.create({
    data: {
      type: data.type,
      referenceId: data.referenceId,
      requestedBy: req.user.id,
      reason: data.reason,
      status: 'pending',
    },
  });

  await logAudit({ req, action: 'REQUEST_CORRECTION', resourceType: 'correction_request', resourceId: request.id });

  return ApiResponse.success(res, 201, 'Correction request submitted to admin', request);
});

const getMyCorrectionRequests = asyncHandler(async (req, res) => {
  const requests = await prisma.correctionRequest.findMany({
    where: { requestedBy: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Your correction requests fetched', requests);
});

module.exports = { requestCorrection, getMyCorrectionRequests };