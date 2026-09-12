const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

const getNoticesForChild = asyncHandler(async (req, res) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: req.student.id, session: { isActive: true } },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'No active enrollment found for this student');

  const notices = await prisma.notice.findMany({
    where: {
      schoolId: req.student.schoolId,
      sessionId: enrollment.sessionId,
      targetRole: { in: ['all', 'parent'] },
      OR: [
        { targetClassId: null, targetSectionId: null },
        { targetClassId: enrollment.classId, targetSectionId: null },
        { targetClassId: enrollment.classId, targetSectionId: enrollment.sectionId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return ApiResponse.success(res, 200, 'Notices fetched', notices);
});

module.exports = { getNoticesForChild };