const { prisma } = require('../config/db');

async function getExamSubjectStats(examSubjectId) {
  const marks = await prisma.marks.findMany({
    where: { examSubjectId },
    select: { marksObtained: true },
  });

  if (marks.length === 0) {
    return { average: 0, highest: 0, lowest: 0, passPercentage: 0, totalEntries: 0 };
  }

  const examSubject = await prisma.examSubject.findUnique({ where: { id: examSubjectId } });
  const values = marks.map((m) => Number(m.marksObtained));

  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const passCount = values.filter((v) => v >= Number(examSubject.passingMarks)).length;
  const passPercentage = (passCount / values.length) * 100;

  return {
    average: Number(average.toFixed(2)),
    highest,
    lowest,
    passPercentage: Number(passPercentage.toFixed(2)),
    totalEntries: values.length,
  };
}

async function getDefaulterList({ schoolId, examTypeId, subjectId }) {
  const where = { examType: { classId: undefined } };

  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examTypeId,
      ...(subjectId ? { subjectId } : {}),
    },
    include: { subject: { select: { name: true } } },
  });

  const defaulters = [];

  for (const es of examSubjects) {
    const marks = await prisma.marks.findMany({
      where: { examSubjectId: es.id, marksObtained: { lt: es.passingMarks } },
      include: {
        enrollment: {
          include: { student: { select: { id: true, name: true, enrollmentNumber: true } } },
        },
      },
    });

    marks.forEach((m) => {
      defaulters.push({
        studentId: m.enrollment.student.id,
        studentName: m.enrollment.student.name,
        enrollmentNumber: m.enrollment.student.enrollmentNumber,
        subject: es.subject.name,
        marksObtained: m.marksObtained,
        passingMarks: es.passingMarks,
      });
    });
  }

  return defaulters;
}

async function getAttendanceDefaulters({ schoolId, sessionId, classId, sectionId, thresholdPercent = 75 }) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      student: { schoolId },
    },
    include: { student: { select: { id: true, name: true, enrollmentNumber: true } } },
  });

  const results = [];

  for (const enr of enrollments) {
    const total = await prisma.attendance.count({ where: { enrollmentId: enr.id } });
    const present = await prisma.attendance.count({ where: { enrollmentId: enr.id, status: { in: ['present', 'late'] } } });

    const percentage = total > 0 ? (present / total) * 100 : 100;

    if (percentage < thresholdPercent) {
      results.push({
        studentId: enr.student.id,
        studentName: enr.student.name,
        enrollmentNumber: enr.student.enrollmentNumber,
        attendancePercentage: Number(percentage.toFixed(2)),
        totalDays: total,
        presentDays: present,
      });
    }
  }

  return results;
}

module.exports = { getExamSubjectStats, getDefaulterList, getAttendanceDefaulters };