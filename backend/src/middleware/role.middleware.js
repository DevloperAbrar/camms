const ApiResponse = require('../utils/apiResponse');

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return ApiResponse.error(res, 403, 'You do not have permission to perform this action');
    }
    next();
  };
}

module.exports = { authorize };