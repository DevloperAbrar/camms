const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const {
  getExamSubjectStats,
  getDefaulterList,
  getAttendanceDefaulters,
  getAttendanceReport,
  getMarksReport,
  getOverview,
  getClassWisePerformance,
  getSectionWisePerformance,
  getSubjectWisePerformance,
  getAttendanceTrend,
  getTopBottomPerformers,
  getStudentProgressTrend,
} = require('../../services/analytics.service');
const { generateTableReportPDF } = require('../../services/pdf.service');

const getExamStats = asyncHandler(async (req, res) => {
  const stats = await getExamSubjectStats(req.params.examSubjectId);
  return ApiResponse.success(res, 200, 'Stats fetched', stats);
});

// Marks Report: ALL marks entries for the exam type (pass + fail)
const getMarksReportList = asyncHandler(async (req, res) => {
  const { examTypeId, subjectId, sectionId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const data = await getMarksReport({ schoolId: req.schoolId, examTypeId, subjectId, sectionId });
  return ApiResponse.success(res, 200, 'Marks report fetched', data);
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

// ═══════════════════════════════════════════════════════════════════════════
// BRANDED PDF DOWNLOADS — same data as the JSON endpoints above, rendered
// through the shared navy/orange PDF engine instead of the browser's plain
// "Print" dialog.
// ═══════════════════════════════════════════════════════════════════════════

function sendPDF(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.end(buffer);
}

const attendanceStatusBadge = (r) => r.attendancePercentage == null
  ? { text: 'No Data', tone: 'neutral' }
  : r.attendancePercentage >= 75
    ? { text: 'Regular', tone: 'good' }
    : { text: 'Low', tone: 'bad' };

const downloadAttendanceReportPDF = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, fromDate, toDate } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const rows = await getAttendanceReport({ schoolId: req.schoolId, sessionId, classId, sectionId, fromDate, toDate });
  const regular = rows.filter((r) => r.attendancePercentage != null && r.attendancePercentage >= 75).length;
  const low = rows.filter((r) => r.attendancePercentage != null && r.attendancePercentage < 75).length;

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Attendance Report',
    subtitle: fromDate && toDate ? `${fromDate} to ${toDate}` : undefined,
    metaBadges: [`${rows.length} students`],
    summaryStats: [
      { label: 'Regular (≥75%)', value: regular, tone: 'good' },
      { label: 'Low Attendance', value: low, tone: 'bad' },
      { label: 'Total Students', value: rows.length, tone: 'neutral' },
    ],
    sections: [{
      heading: 'Student Attendance',
      note: `${rows.length} records`,
      columns: [
        { key: 'studentName', label: 'Student', width: 0.26 },
        { key: 'enrollmentNumber', label: 'Enr. No.', width: 0.16 },
        { key: 'presentDays', label: 'Present', width: 0.12, align: 'center' },
        { key: 'totalDays', label: 'Total', width: 0.12, align: 'center' },
        { key: 'attendancePercentage', label: 'Attendance %', width: 0.16, align: 'center', value: (r) => r.attendancePercentage != null ? `${r.attendancePercentage}%` : '—' },
        { key: 'status', label: 'Status', width: 0.18, align: 'center', badge: attendanceStatusBadge },
      ],
      rows,
    }],
  });

  return sendPDF(res, buffer, `attendance-report-${fromDate || 'na'}-to-${toDate || 'na'}.pdf`);
});

const downloadMarksReportPDF = asyncHandler(async (req, res) => {
  const { examTypeId, subjectId, sectionId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const rows = await getMarksReport({ schoolId: req.schoolId, examTypeId, subjectId, sectionId });
  const passed = rows.filter((r) => r.marksObtained >= r.passingMarks).length;
  const failed = rows.length - passed;

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Marks Report',
    metaBadges: [`${rows.length} entries`],
    summaryStats: [
      { label: 'Passed', value: passed, tone: 'good' },
      { label: 'Failed', value: failed, tone: 'bad' },
      { label: 'Total Entries', value: rows.length, tone: 'neutral' },
    ],
    sections: [{
      heading: 'Marks',
      note: `${rows.length} entries`,
      columns: [
        { key: 'studentName', label: 'Student', width: 0.26 },
        { key: 'enrollmentNumber', label: 'Enr. No.', width: 0.16 },
        { key: 'subject', label: 'Subject', width: 0.20 },
        { key: 'marksObtained', label: 'Marks', width: 0.12, align: 'center' },
        { key: 'passingMarks', label: 'Passing', width: 0.12, align: 'center' },
        { key: 'result', label: 'Result', width: 0.14, align: 'center', badge: (r) => r.marksObtained >= r.passingMarks ? { text: 'Pass', tone: 'good' } : { text: 'Fail', tone: 'bad' } },
      ],
      rows,
    }],
  });

  return sendPDF(res, buffer, `marks-report-${examTypeId}.pdf`);
});

const downloadMarksDefaultersPDF = asyncHandler(async (req, res) => {
  const { examTypeId, subjectId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');

  const rows = await getDefaulterList({ schoolId: req.schoolId, examTypeId, subjectId });

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Marks Defaulters',
    metaBadges: [`${rows.length} students below passing marks`],
    sections: [{
      heading: 'Defaulters',
      note: `${rows.length} students`,
      columns: [
        { key: 'studentName', label: 'Student', width: 0.28 },
        { key: 'enrollmentNumber', label: 'Enr. No.', width: 0.18 },
        { key: 'subject', label: 'Subject', width: 0.20 },
        { key: 'marksObtained', label: 'Obtained', width: 0.12, align: 'center', colorFn: () => '#dc2626', bold: true },
        { key: 'passingMarks', label: 'Passing', width: 0.12, align: 'center' },
        { key: 'deficit', label: 'Deficit', width: 0.10, align: 'center', value: (r) => `-${(r.passingMarks - r.marksObtained).toFixed(1)}`, badge: (r) => ({ text: `-${(r.passingMarks - r.marksObtained).toFixed(1)}`, tone: 'bad' }) },
      ],
      rows,
    }],
  });

  return sendPDF(res, buffer, `marks-defaulters-${examTypeId}.pdf`);
});

const downloadAttendanceDefaultersPDF = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, threshold } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');
  const thresholdPercent = threshold ? Number(threshold) : 75;

  const rows = await getAttendanceDefaulters({ schoolId: req.schoolId, sessionId, classId, sectionId, thresholdPercent });

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: `Attendance Defaulters — Below ${thresholdPercent}%`,
    metaBadges: [`${rows.length} students`, `Threshold ${thresholdPercent}%`],
    sections: [{
      heading: 'Defaulters',
      note: `${rows.length} students`,
      columns: [
        { key: 'studentName', label: 'Student', width: 0.26 },
        { key: 'enrollmentNumber', label: 'Enr. No.', width: 0.16 },
        { key: 'presentDays', label: 'Present', width: 0.14, align: 'center', colorFn: () => '#15803d', bold: true },
        { key: 'totalDays', label: 'Total', width: 0.12, align: 'center' },
        { key: 'attendancePercentage', label: 'Attendance %', width: 0.16, align: 'center', badge: (r) => ({ text: `${r.attendancePercentage}%`, tone: 'bad' }) },
        {
          key: 'shortage', label: 'Shortage', width: 0.16, align: 'center',
          value: (r) => {
            const needed = Math.ceil((thresholdPercent / 100) * r.totalDays) - r.presentDays;
            return needed > 0 ? `${needed} days short` : '—';
          },
        },
      ],
      rows,
    }],
  });

  return sendPDF(res, buffer, `attendance-defaulters-${thresholdPercent}pct.pdf`);
});

const downloadClassPerformancePDF = asyncHandler(async (req, res) => {
  const { sessionId, classId, view } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const isSection = view === 'section';
  if (isSection && !classId) return ApiResponse.error(res, 422, 'classId is required for section view');

  const rows = isSection
    ? await getSectionWisePerformance({ schoolId: req.schoolId, sessionId, classId })
    : await getClassWisePerformance({ schoolId: req.schoolId, sessionId });

  const nameCol = isSection
    ? { key: 'sectionName', label: 'Section', width: 0.30 }
    : { key: 'className', label: 'Class', width: 0.30 };

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: `${isSection ? 'Section' : 'Class'} Performance Report`,
    metaBadges: [`${rows.length} ${isSection ? 'sections' : 'classes'}`],
    sections: [{
      heading: 'Performance',
      note: `${rows.length} ${isSection ? 'sections' : 'classes'}`,
      columns: [
        nameCol,
        { key: 'avgScorePercent', label: 'Avg Score %', width: 0.22, align: 'center', value: (r) => `${r.avgScorePercent}%` },
        { key: 'passPercent', label: 'Pass %', width: 0.22, align: 'center', badge: (r) => ({ text: `${r.passPercent}%`, tone: r.passPercent >= 75 ? 'good' : r.passPercent >= 40 ? 'warn' : 'bad' }) },
        { key: 'attendancePercent', label: 'Attendance %', width: 0.26, align: 'center', value: (r) => `${r.attendancePercent}%` },
      ],
      rows,
    }],
  });

  return sendPDF(res, buffer, `${isSection ? 'section' : 'class'}-performance-${sessionId}.pdf`);
});

const downloadStudentProgressPDF = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  if (!studentId || !sessionId) return ApiResponse.error(res, 422, 'studentId and sessionId are required');

  const [data, student] = await Promise.all([
    getStudentProgressTrend({ schoolId: req.schoolId, studentId, sessionId }),
    prisma.student.findUnique({ where: { id: studentId }, select: { name: true, enrollmentNumber: true } }),
  ]);

  const buffer = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Student Progress Report',
    subtitle: student ? `${student.name}${student.enrollmentNumber ? ' · ' + student.enrollmentNumber : ''}` : undefined,
    sections: [
      {
        heading: 'Exam Trend',
        columns: [
          { key: 'examType', label: 'Exam', width: 0.46 },
          { key: 'averagePercent', label: 'Average %', width: 0.27, align: 'center', value: (r) => r.averagePercent != null ? `${r.averagePercent}%` : '—' },
          { key: 'result', label: 'Result', width: 0.27, align: 'center', badge: (r) => r.averagePercent == null ? { text: 'Pending', tone: 'neutral' } : { text: r.averagePercent >= 40 ? 'Pass' : 'Fail', tone: r.averagePercent >= 40 ? 'good' : 'bad' } },
        ],
        rows: data.examTrend || [],
      },
      {
        heading: `Subject Breakdown${data.latestExamType ? ' — ' + data.latestExamType : ' (Latest Exam)'}`,
        columns: [
          { key: 'subject', label: 'Subject', width: 0.40 },
          { key: 'percent', label: 'Score %', width: 0.30, align: 'center', value: (r) => `${r.percent}%` },
          { key: 'result', label: 'Result', width: 0.30, align: 'center', badge: (r) => ({ text: r.percent >= 40 ? 'Pass' : 'Fail', tone: r.percent >= 40 ? 'good' : 'bad' }) },
        ],
        rows: data.subjectBreakdown || [],
      },
      {
        heading: 'Attendance Trend',
        columns: [
          { key: 'month', label: 'Month', width: 0.5 },
          { key: 'attendancePercent', label: 'Attendance %', width: 0.5, align: 'center', value: (r) => `${r.attendancePercent}%` },
        ],
        rows: data.attendanceTrend || [],
      },
    ],
  });

  return sendPDF(res, buffer, `student-progress-${studentId}.pdf`);
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
  getMarksReportList,
  downloadAttendanceReportPDF,
  downloadMarksReportPDF,
  downloadMarksDefaultersPDF,
  downloadAttendanceDefaultersPDF,
  downloadClassPerformancePDF,
  downloadStudentProgressPDF,
};