const { verifyToken } = require('../utils/jwt');
const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const constants = require('../config/constants');

async function authenticate(req, res, next) {
  try {
    const token = req.cookies[constants.COOKIE_NAME];

    if (!token) {
      return ApiResponse.error(res, 401, 'Not authenticated, please log in');
    }

    const decoded = verifyToken(token);

    // Super Admin: bootstrap identity, no DB lookup
    if (decoded.role === constants.ROLES.SUPERADMIN) {
      req.user = { id: 'superadmin', role: constants.ROLES.SUPERADMIN, schoolId: null };
      return next();
    }

    // Parent: identity lives in the token itself, not the users table
    if (decoded.role === 'parent') {
      req.user = {
        id: decoded.parentEmail,
        role: 'parent',
        parentEmail: decoded.parentEmail,
        children: decoded.children,
        schoolId: null,
      };
      return next();
    }

    // Admin / Faculty: verify the user still exists and is active
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || user.status !== 'active') {
      return ApiResponse.error(res, 401, 'Session invalid, please log in again');
    }

    req.user = {
      id: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.name,
      email: user.email,
    };

    next();
  } catch (err) {
    return ApiResponse.error(res, 401, 'Invalid or expired session, please log in again');
  }
}

module.exports = { authenticate };