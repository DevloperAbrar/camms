const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createSessionSchema } = require('../../validators/schooladmin.validator');

const createSession = asyncHandler(async (req, res) => {
  const data = createSessionSchema.parse(req.body);

  const session = await prisma.academicSession.create({
    data: {
      schoolId: req.schoolId,
      label: data.label,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isActive: false,
    },
  });

  await logAudit({ req, action: 'CREATE_SESSION', resourceType: 'academic_session', resourceId: session.id });

  return ApiResponse.success(res, 201, 'Session created', session);
});

const getSessions = asyncHandler(async (req, res) => {
  const sessions = await prisma.academicSession.findMany({
    where: { schoolId: req.schoolId },
    orderBy: { startDate: 'desc' },
  });
  return ApiResponse.success(res, 200, 'Sessions fetched', sessions);
});

// Sets one session active, and automatically makes the previous one read-only
const activateSession = asyncHandler(async (req, res) => {
  const sessionId = req.params.id;

  await prisma.$transaction([
    prisma.academicSession.updateMany({
      where: { schoolId: req.schoolId, isActive: true },
      data: { isActive: false },
    }),
    prisma.academicSession.update({
      where: { id: sessionId },
      data: { isActive: true },
    }),
  ]);

  await logAudit({ req, action: 'ACTIVATE_SESSION', resourceType: 'academic_session', resourceId: sessionId });

  return ApiResponse.success(res, 200, 'Session activated');
});

module.exports = { createSession, getSessions, activateSession };