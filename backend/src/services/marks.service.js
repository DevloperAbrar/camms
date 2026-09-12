const { prisma } = require('../config/db');

async function verifyFacultyCanEnterMarks({ facultyId, examSubjectId }) {
  const examSubject = await prisma.examSubject.findUnique({
    where: { id: examSubjectId },
    include: { examType: true, subject: true },
  });

  if (!examSubject) return { allowed: false, reason: 'Exam subject not found' };

  const assignment = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId,
      classId: examSubject.examType.classId,
      subjectId: examSubject.subjectId,
      sessionId: examSubject.examType.sessionId,
      isActive: true,
    },
  });

  if (!assignment) return { allowed: false, reason: 'You are not assigned to this class/subject' };

  return { allowed: true, examSubject };
}

module.exports = { verifyFacultyCanEnterMarks };