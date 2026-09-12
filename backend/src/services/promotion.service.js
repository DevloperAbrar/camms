const { prisma } = require('../config/db');

// Core rule: never touch the old enrollment row. Always create a new one.
async function promoteStudents({ schoolId, fromSessionId, toSessionId, promotions, actorId }) {
  const results = { promoted: 0, retained: 0, transferredOut: 0, graduated: 0, errors: [] };

  await prisma.$transaction(async (tx) => {
    for (const p of promotions) {
      const oldEnrollment = await tx.enrollment.findFirst({
        where: { studentId: p.studentId, sessionId: fromSessionId },
      });

      if (!oldEnrollment) {
        results.errors.push({ studentId: p.studentId, error: 'No enrollment found in source session' });
        continue;
      }

      if (p.action === 'promoted') {
        if (!p.toClassId || !p.toSectionId) {
          results.errors.push({ studentId: p.studentId, error: 'Missing target class/section for promotion' });
          continue;
        }

        await tx.enrollment.create({
          data: {
            studentId: p.studentId,
            sessionId: toSessionId,
            classId: p.toClassId,
            sectionId: p.toSectionId,
            rollNumber: p.rollNumber || null,
            status: 'active',
          },
        });
        results.promoted++;
      } else if (p.action === 'retained') {
        // Stays in the same class, but still gets a fresh enrollment row for the new session
        await tx.enrollment.create({
          data: {
            studentId: p.studentId,
            sessionId: toSessionId,
            classId: oldEnrollment.classId,
            sectionId: oldEnrollment.sectionId,
            rollNumber: p.rollNumber || oldEnrollment.rollNumber,
            status: 'active',
          },
        });
        results.retained++;
      } else if (p.action === 'transferred_out') {
        await tx.student.update({
          where: { id: p.studentId },
          data: { status: 'transferred' },
        });
        results.transferredOut++;
      } else if (p.action === 'graduated') {
        await tx.student.update({
          where: { id: p.studentId },
          data: { status: 'graduated' },
        });
        results.graduated++;
      }
    }
  });

  return results;
}

module.exports = { promoteStudents };