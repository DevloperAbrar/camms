const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

const getDashboard = asyncHandler(async (req, res) => {
  const activeSession = await prisma.academicSession.findFirst({
    where: { schoolId: req.schoolId, isActive: true },
  });

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, sessionId: activeSession ? activeSession.id : undefined },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { name: true } },
    },
  });

  const recentNotices = await prisma.notice.findMany({
    where: {
      schoolId: req.schoolId,
      targetRole: { in: ['all', 'faculty'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const pendingCorrections = await prisma.correctionRequest.count({
    where: { requestedBy: req.user.id, status: 'pending' },
  });

  return ApiResponse.success(res, 200, 'Dashboard fetched', {
    activeSession,
    assignments,
    recentNotices,
    pendingCorrections,
  });
});

module.exports = { getDashboard };