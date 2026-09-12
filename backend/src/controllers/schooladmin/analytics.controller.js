const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { getExamSubjectStats, getDefaulterList, getAttendanceDefaulters } = require('../../services/analytics.service');

const getExamStats = asyncHandler(async (req, res) => {
  const stats = await getExamSubjectStats(req.params.examSubjectId);
  return ApiResponse.success(res, 200, 'Stats fetched', stats);
});

const getMarksDefaulters = asyncHandler(async (req, res) => {
  const { examTypeId, subjectId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const defaulters = await getDefaulterList({ schoolId: req.schoolId, examTypeId, subjectId });
  return ApiResponse.success(res, 200, 'Defaulters fetched', defaulters);
});

const getAttendanceDefaultersList = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, threshold } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const defaulters = await getAttendanceDefaulters({
    schoolId: req.schoolId,
    sessionId,
    classId,
    sectionId,
    thresholdPercent: threshold ? Number(threshold) : 75,
  });

  return ApiResponse.success(res, 200, 'Attendance defaulters fetched', defaulters);
});

// Student report card: every exam type in the session, consolidated
const getStudentReportCard = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  if (!studentId || !sessionId) return ApiResponse.error(res, 422, 'studentId and sessionId are required');

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, sessionId },
    include: { student: true, class: true, section: true },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'Enrollment not found for this student/session');

  const examTypes = await prisma.examType.findMany({
    where: { sessionId, classId: enrollment.classId },
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

  const reportCard = examTypes.map((et) => ({
    examType: et.name,
    weightagePercent: et.weightagePercent,
    subjects: et.examSubjects.map((es) => ({
      subject: es.subject.name,
      maxMarks: es.maxMarks,
      passingMarks: es.passingMarks,
      marksObtained: es.marks[0] ? es.marks[0].marksObtained : null,
    })),
  }));

  return ApiResponse.success(res, 200, 'Report card fetched', {
    student: enrollment.student.name,
    enrollmentNumber: enrollment.student.enrollmentNumber,
    class: enrollment.class.name,
    section: enrollment.section.name,
    reportCard,
  });
});

module.exports = { getExamStats, getMarksDefaulters, getAttendanceDefaultersList, getStudentReportCard };