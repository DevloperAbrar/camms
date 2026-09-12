const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const constants = require('../config/constants');

async function checkSubscriptionActive(req, res, next) {
  try {
    if (req.user.role === constants.ROLES.SUPERADMIN) {
      return next();
    }

    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId },
    });

    if (!school) {
      return ApiResponse.error(res, 404, 'School not found');
    }

    if (school.status === constants.SCHOOL_STATUS.SUSPENDED) {
      return ApiResponse.error(res, 403, 'Your school account has been suspended. Please contact support.');
    }

    if (school.status === constants.SCHOOL_STATUS.EXPIRED) {
      return ApiResponse.error(res, 403, 'Your subscription has expired. Please contact your administrator to renew.');
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkSubscriptionActive };