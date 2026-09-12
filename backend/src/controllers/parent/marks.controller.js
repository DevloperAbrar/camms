const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

// Per exam type, per subject
const getMarksByExamType = asyncHandler(async (req, res) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: req.student.id, session: { isActive: true } },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'No active enrollment found for this student');

  const examTypes = await prisma.examType.findMany({
    where: { sessionId: enrollment.sessionId, classId: enrollment.classId },
    include: {
      examSubjects: {
        include: {
          subject: { select: { name: true } },
          marks: { where: { enrollmentId: enrollment.id } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const result = examTypes.map((et) => ({
    examType: et.name,
    subjects: et.examSubjects.map((es) => ({
      subject: es.subject.name,
      maxMarks: es.maxMarks,
      passingMarks: es.passingMarks,
      marksObtained: es.marks[0] ? es.marks[0].marksObtained : null,
      status: es.marks[0] ? (Number(es.marks[0].marksObtained) >= Number(es.passingMarks) ? 'Pass' : 'Fail') : 'Pending',
    })),
  }));

  return ApiResponse.success(res, 200, 'Marks fetched', result);
});

// Consolidated report card with grade — reuses the same logic as admin's report card
const getConsolidatedReportCard = asyncHandler(async (req, res) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: req.student.id, session: { isActive: true } },
    include: { class: true, section: true, student: true },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'No active enrollment found for this student');

  const examTypes = await prisma.examType.findMany({
    where: { sessionId: enrollment.sessionId, classId: enrollment.classId },
    include: {
      examSubjects: {
        include: {
          subject: { select: { name: true } },
          marks: { where: { enrollmentId: enrollment.id } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  let totalObtained = 0;
  let totalMax = 0;

  const reportCard = examTypes.map((et) => {
    const subjects = et.examSubjects.map((es) => {
      const obtained = es.marks[0] ? Number(es.marks[0].marksObtained) : 0;
      if (es.marks[0]) {
        totalObtained += obtained;
        totalMax += Number(es.maxMarks);
      }
      return {
        subject: es.subject.name,
        maxMarks: es.maxMarks,
        marksObtained: es.marks[0] ? es.marks[0].marksObtained : null,
      };
    });
    return { examType: et.name, weightagePercent: et.weightagePercent, subjects };
  });

  const overallPercentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

  return ApiResponse.success(res, 200, 'Report card fetched', {
    student: enrollment.student.name,
    enrollmentNumber: enrollment.student.enrollmentNumber,
    class: enrollment.class.name,
    section: enrollment.section.name,
    reportCard,
    overallPercentage,
  });
});

module.exports = { getMarksByExamType, getConsolidatedReportCard };