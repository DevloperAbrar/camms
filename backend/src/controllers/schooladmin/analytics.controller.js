const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const {
  getExamSubjectStats,
  getDefaulterList,
  getAttendanceDefaulters,
  getAttendanceReport,
  getOverview,
  getClassWisePerformance,
  getSectionWisePerformance,
  getSubjectWisePerformance,
  getAttendanceTrend,
  getTopBottomPerformers,
  getStudentProgressTrend,
} = require('../../services/analytics.service');

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

// ---------------------------------------------------------------------------
// Overview: school-wide KPIs for the selected session
// ---------------------------------------------------------------------------
const getOverviewStats = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const data = await getOverview({ schoolId: req.schoolId, sessionId });
  return ApiResponse.success(res, 200, 'Overview fetched', data);
});

// ---------------------------------------------------------------------------
// Class comparison: avg score %, pass % and attendance % per class
// ---------------------------------------------------------------------------
const getClassComparison = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const data = await getClassWisePerformance({ schoolId: req.schoolId, sessionId });
  return ApiResponse.success(res, 200, 'Class comparison fetched', data);
});

// ---------------------------------------------------------------------------
// Section comparison: same metrics, broken down by section within a class
// ---------------------------------------------------------------------------
const getSectionComparison = asyncHandler(async (req, res) => {
  const { sessionId, classId } = req.query;
  if (!sessionId || !classId) return ApiResponse.error(res, 422, 'sessionId and classId are required');

  const data = await getSectionWisePerformance({ schoolId: req.schoolId, sessionId, classId });
  return ApiResponse.success(res, 200, 'Section comparison fetched', data);
});

// ---------------------------------------------------------------------------
// Subject comparison: avg/highest/lowest/pass % per subject for an exam type
// ---------------------------------------------------------------------------
const getSubjectComparison = asyncHandler(async (req, res) => {
  const { examTypeId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const data = await getSubjectWisePerformance({ schoolId: req.schoolId, examTypeId });
  return ApiResponse.success(res, 200, 'Subject comparison fetched', data);
});

// ---------------------------------------------------------------------------
// Attendance trend: month-by-month attendance % for a class/section/session
// ---------------------------------------------------------------------------
const getAttendanceTrendStats = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const data = await getAttendanceTrend({ schoolId: req.schoolId, sessionId, classId, sectionId });
  return ApiResponse.success(res, 200, 'Attendance trend fetched', data);
});

// ---------------------------------------------------------------------------
// Top / bottom performers for an exam type (optionally within one section)
// ---------------------------------------------------------------------------
const getPerformersList = asyncHandler(async (req, res) => {
  const { examTypeId, sectionId, limit } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const data = await getTopBottomPerformers({
    schoolId: req.schoolId,
    examTypeId,
    sectionId,
    limit: limit ? Number(limit) : 5,
  });
  return ApiResponse.success(res, 200, 'Performers fetched', data);
});

// ---------------------------------------------------------------------------
// Individual student progress: exam trend, latest subject breakdown, attendance trend
// ---------------------------------------------------------------------------
const getStudentProgress = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  if (!studentId || !sessionId) return ApiResponse.error(res, 422, 'studentId and sessionId are required');

  const data = await getStudentProgressTrend({ schoolId: req.schoolId, studentId, sessionId });
  return ApiResponse.success(res, 200, 'Student progress fetched', data);
});

// ---------------------------------------------------------------------------
// Attendance Report: all students with date-range filtered attendance stats
// ---------------------------------------------------------------------------
const getAttendanceReportList = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, fromDate, toDate } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const data = await getAttendanceReport({
    schoolId: req.schoolId,
    sessionId,
    classId,
    sectionId,
    fromDate,
    toDate,
  });

  return ApiResponse.success(res, 200, 'Attendance report fetched', data);
});

module.exports = {
  getExamStats,
  getMarksDefaulters,
  getAttendanceDefaultersList,
  getAttendanceReportList,
  getStudentReportCard,
  getOverviewStats,
  getClassComparison,
  getSectionComparison,
  getSubjectComparison,
  getAttendanceTrendStats,
  getPerformersList,
  getStudentProgress,
};