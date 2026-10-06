const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

function errorMiddleware(err, req, res, next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.code === 'P2002') {
    return ApiResponse.error(res, 409, 'A record with this value already exists', {
      fields: err.meta ? err.meta.target : null,
    });
  }

  if (err.code === 'P2025') {
    return ApiResponse.error(res, 404, 'Record not found');
  }

  if (err.name === 'ZodError') {
    // Zod v4 exposes .issues (.errors no longer exists)
    const issues = err.issues || err.errors || [];
    const first = issues[0];
    const message = first
      ? `${first.path && first.path.length ? first.path.join('.') + ': ' : ''}${first.message}`
      : 'Validation failed';
    return ApiResponse.error(res, 422, message, issues);
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 401, 'Invalid or expired session, please log in again');
  }

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Something went wrong on our end';

  return ApiResponse.error(res, statusCode, message);
}

module.exports = errorMiddleware;