const ApiResponse = require('../utils/apiResponse');

// Ensures every non-superadmin request is scoped to req.user.schoolId
// Never allow schoolId to come from req.body or req.query for tenant-scoped routes.
function enforceTenant(req, res, next) {
  if (req.user.role === 'superadmin') {
    return next();
  }

  if (!req.user.schoolId) {
    return ApiResponse.error(res, 403, 'No school associated with this account');
  }

  // Strip any client-supplied schoolId to prevent cross-tenant access attempts
  if (req.body && req.body.schoolId) {
    delete req.body.schoolId;
  }
  if (req.query && req.query.schoolId) {
    delete req.query.schoolId;
  }

  req.schoolId = req.user.schoolId;
  next();
}

module.exports = { enforceTenant };