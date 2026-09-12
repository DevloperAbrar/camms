const ApiResponse = require('../utils/apiResponse');
const { prisma } = require('../config/db');

// Confirms the studentId in the request actually belongs to this logged-in parent.
// This is the parent-portal equivalent of tenant scoping — never trust a studentId
// from the client without checking it against req.user.children.
async function verifyChildAccess(req, res, next) {
  const studentId = req.query.studentId || req.body.studentId || req.params.studentId;

  if (!studentId) {
    return ApiResponse.error(res, 422, 'studentId is required');
  }

  if (!req.user.children.includes(studentId)) {
    return ApiResponse.error(res, 403, 'You do not have access to this student record');
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.status !== 'active') {
    return ApiResponse.error(res, 404, 'Student record not found or inactive');
  }

  req.student = student;
  next();
}

module.exports = { verifyChildAccess };