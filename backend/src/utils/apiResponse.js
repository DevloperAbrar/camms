class ApiResponse {
    static success(res, statusCode, message, data = null) {
      return res.status(statusCode).json({
        success: true,
        message,
        data,
      });
    }
  
    static error(res, statusCode, message, errors = null) {
      return res.status(statusCode).json({
        success: false,
        message,
        errors,
      });
    }
  }
  
  module.exports = ApiResponse;