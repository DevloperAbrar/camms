const { prisma } = require('../config/db');

// Verifies the faculty member is actually assigned to this class/section/subject
// in the given session before allowing them to mark attendance for it.
async function verifyFacultyAssignment({ facultyId, classId, sectionId, subjectId, sessionId }) {
  const assignment = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId,
      classId,
      sectionId,
      sessionId,
      isActive: true,
      ...(subjectId ? { subjectId } : {}),
    },
  });
  return !!assignment;
}

async function calculateEnrollmentAttendancePercentage(enrollmentId) {
  const total = await prisma.attendance.count({ where: { enrollmentId } });
  const present = await prisma.attendance.count({
    where: { enrollmentId, status: { in: ['present', 'late'] } },
  });

  return total > 0 ? Number(((present / total) * 100).toFixed(2)) : 100;
}

module.exports = { verifyFacultyAssignment, calculateEnrollmentAttendancePercentage };