const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const {
  getFacultyViewableSections,
  getFacultyViewableSubjectIds,
} = require('../../services/facultyScope.service');
const analyticsService = require('../../services/analytics.service');
const { generateStudentReportCardPDF } = require('../../services/pdf.service');

// GET /faculty/reports/attendance
const getMyAttendanceReport = asyncHandler(async (req, res) => {
  const { sectionId, subjectId, startDate, endDate } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (sectionId && !allowedSectionIds.includes(Number(sectionId))) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  const report = await analyticsService.getAttendanceReport({
    schoolId,
    sectionIds: sectionId ? [Number(sectionId)] : allowedSectionIds,
    subjectId: subjectId ? Number(subjectId) : undefined,
    startDate,
    endDate,
  });

  return ApiResponse.success(res, 200, 'Attendance report fetched', report);
});

// GET /faculty/reports/exam-types
const getMyExamTypes = asyncHandler(async (req, res) => {
  const examTypes = await prisma.examType.findMany({
    where: { schoolId: req.schoolId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return ApiResponse.success(res, 200, 'Exam types fetched', examTypes);
});

// GET /faculty/reports/subjects
const getMySubjectsForReports = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { sessionId } = req.query;

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });

  if (!viewableSections.length) {
    return ApiResponse.success(res, 200, 'Subjects fetched', []);
  }

  // Collect all unique classId+sessionId combos then get subjects for each
  const combos = [
    ...new Map(
      viewableSections.map(s => [`${s.sessionId}|${s.classId}`, { sessionId: s.sessionId, classId: s.classId }])
    ).values(),
  ];

  const subjectArrays = await Promise.all(
    combos.map(({ sessionId: sid, classId }) =>
      getFacultyViewableSubjectIds({ facultyId, sessionId: sid, classId })
    )
  );

  const subjectIds = [...new Set(subjectArrays.flat())];

  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true, classId: true },
  });

  return ApiResponse.success(res, 200, 'Subjects fetched', subjects);
});

// GET /faculty/reports/marks
const getMyMarksReport = asyncHandler(async (req, res) => {
  const { sectionId, subjectId, examTypeId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (sectionId && !allowedSectionIds.includes(Number(sectionId))) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  const report = await analyticsService.getMarksReport({
    schoolId,
    sectionIds: sectionId ? [Number(sectionId)] : allowedSectionIds,
    subjectId: subjectId ? Number(subjectId) : undefined,
    examTypeId: examTypeId ? Number(examTypeId) : undefined,
  });

  return ApiResponse.success(res, 200, 'Marks report fetched', report);
});

// GET /faculty/reports/students
const getMyStudentsForReports = asyncHandler(async (req, res) => {
  const { sectionId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (sectionId && !allowedSectionIds.includes(Number(sectionId))) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  const targetSectionIds = sectionId ? [Number(sectionId)] : allowedSectionIds;

  const sections = await prisma.section.findMany({
    where: { id: { in: targetSectionIds }, schoolId },
    select: {
      id: true,
      name: true,
      students: {
        where: { status: 'active' },
        select: { id: true, name: true, rollNumber: true },
      },
    },
  });

  const students = sections.flatMap(sec =>
    sec.students.map(st => ({
      id: st.id,
      name: st.name,
      rollNumber: st.rollNumber,
      sectionId: sec.id,
      sectionName: sec.name,
    }))
  );

  return ApiResponse.success(res, 200, 'Students fetched', students);
});

// GET /faculty/reports/report-card
const getMyStudentReportCard = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId },
    select: { id: true, sectionId: true },
  });

  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (!allowedSectionIds.includes(student.sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this student');
  }

  const reportCard = await analyticsService.getStudentReportCard({
    studentId: Number(studentId),
    sessionId: Number(sessionId),
    schoolId,
  });

  return ApiResponse.success(res, 200, 'Report card fetched', reportCard);
});

// GET /faculty/reports/report-card-pdf
const downloadMyStudentReportCardPDF = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  if (!studentId || !sessionId) {
    return ApiResponse.error(res, 422, 'studentId and sessionId are required');
  }

  const student = await prisma.student.findFirst({
    where: { id: Number(studentId), schoolId },
    select: { id: true, sectionId: true },
  });

  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (!allowedSectionIds.includes(student.sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this student');
  }

  const pdfBuffer = await generateStudentReportCardPDF({
    studentId: Number(studentId),
    sessionId: Number(sessionId),
    schoolId,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-card-${studentId}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.end(pdfBuffer);
});

module.exports = {
  getMyAttendanceReport,
  getMyExamTypes,
  getMySubjectsForReports,
  getMyMarksReport,
  getMyStudentsForReports,
  getMyStudentReportCard,
  downloadMyStudentReportCardPDF,
};