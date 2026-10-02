// Throw from anywhere (including inside prisma.$transaction) to return a clean HTTP error.
// error.middleware.js already honours err.statusCode.
function httpError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
  }
  
  module.exports = httpError;