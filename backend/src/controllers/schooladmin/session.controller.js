const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createSessionSchema, updateSessionSchema } = require('../../validators/schooladmin.validator');

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

const updateSession = asyncHandler(async (req, res) => {
  const data = updateSessionSchema.parse(req.body);

  const session = await prisma.academicSession.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
  });
  if (!session) return ApiResponse.error(res, 404, 'Session not found');

  const updated = await prisma.academicSession.update({
    where: { id: req.params.id },
    data: {
      ...(data.label ? { label: data.label } : {}),
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
    },
  });

  await logAudit({ req, action: 'UPDATE_SESSION', resourceType: 'academic_session', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Session updated', updated);
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

// Only removable if nothing was ever built on top of it
const deleteSession = asyncHandler(async (req, res) => {
  const session = await prisma.academicSession.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
  });
  if (!session) return ApiResponse.error(res, 404, 'Session not found');

  if (session.isActive) {
    return ApiResponse.error(res, 409, 'Cannot delete the active session. Activate a different session first.');
  }

  const [classCount, enrollmentCount] = await Promise.all([
    prisma.class.count({ where: { sessionId: req.params.id } }),
    prisma.enrollment.count({ where: { sessionId: req.params.id } }),
  ]);

  if (classCount > 0 || enrollmentCount > 0) {
    return ApiResponse.error(res, 409, 'Cannot delete a session that has classes or enrolled students. Remove those first.');
  }

  await prisma.academicSession.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_SESSION', resourceType: 'academic_session', resourceId: req.params.id });

  return ApiResponse.success(res, 200, 'Session deleted');
});

module.exports = { createSession, getSessions, updateSession, activateSession, deleteSession };