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
    return ApiResponse.error(res, 422, 'Validation failed', err.errors);
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 401, 'Invalid or expired session, please log in again');
  }

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Something went wrong on our end';

  return ApiResponse.error(res, statusCode, message);
}

module.exports = errorMiddleware;