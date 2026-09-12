const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

// Powers the child-switcher shown right after login
const getMyChildren = asyncHandler(async (req, res) => {
  const children = await prisma.student.findMany({
    where: { id: { in: req.user.children }, status: 'active' },
    include: {
      school: { select: { id: true, name: true, logoUrl: true } },
      enrollments: {
        include: {
          session: { select: { label: true, isActive: true } },
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
        where: { session: { isActive: true } },
      },
    },
  });

  return ApiResponse.success(res, 200, 'Children fetched', children);
});

module.exports = { getMyChildren };