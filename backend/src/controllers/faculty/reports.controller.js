const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
// prisma is already imported above — used for facultyAssignment check in attendance report
const {
  getFacultyViewableSections,
  getFacultyViewableSubjectIds,
} = require('../../services/facultyScope.service');
const analyticsService = require('../../services/analytics.service');
const { generateStudentReportCardPDF } = require('../../services/pdf.service');

// GET /faculty/reports/attendance
// Frontend sends: sessionId, classId, sectionId, fromDate, toDate, subjectId (optional)
// Class teachers: can also pass subjectId to get subject-wise attendance for their section.
const getMyAttendanceReport = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, fromDate, toDate, subjectId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (!allowedSectionIds.length) {
    return ApiResponse.success(res, 200, 'Attendance report fetched', []);
  }

  if (sectionId && !allowedSectionIds.includes(sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  // If subjectId is requested, verify faculty has access (either assigned to subject OR is class teacher of section)
  if (subjectId && sectionId) {
    const section = viewableSections.find(s => s.sectionId === sectionId);
    if (!section) {
      return ApiResponse.error(res, 403, 'Access denied to this section');
    }
    if (!section.isClassTeacher) {
      // Regular faculty: must be assigned to this subject in this section
      const assigned = await prisma.facultyAssignment.findFirst({
        where: { facultyId, sectionId, subjectId, sessionId, isActive: true },
      });
      if (!assigned) {
        return ApiResponse.error(res, 403, 'Access denied to this subject in this section');
      }
    }
    // Class teachers can view any subject in their section — no extra check needed
  }

  // Narrow target sections
  let targetSectionIds;
  if (sectionId) {
    targetSectionIds = [sectionId];
  } else if (classId) {
    const classSections = viewableSections
      .filter(s => s.classId === classId)
      .map(s => s.sectionId);
    targetSectionIds = classSections;
  } else {
    targetSectionIds = allowedSectionIds;
  }

  if (!targetSectionIds.length) {
    return ApiResponse.success(res, 200, 'Attendance report fetched', []);
  }

  const report = await analyticsService.getAttendanceReport({
    schoolId,
    sessionId,
    sectionIds: targetSectionIds,
    fromDate,
    toDate,
    subjectId: subjectId || undefined,   // undefined → daily (null) attendance
  });

  return ApiResponse.success(res, 200, 'Attendance report fetched', report);
});

// GET /faculty/reports/exam-types
// Frontend sends: sessionId, classId
const getMyExamTypes = asyncHandler(async (req, res) => {
  const { sessionId, classId } = req.query;

  const where = { schoolId: req.schoolId };
  if (sessionId) where.sessionId = sessionId;
  if (classId)   where.classId   = classId;

  const examTypes = await prisma.examType.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
  return ApiResponse.success(res, 200, 'Exam types fetched', examTypes);
});

// GET /faculty/reports/subjects
// Frontend sends: sessionId, classId
const getMySubjectsForReports = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { sessionId, classId } = req.query;

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });

  if (!viewableSections.length) {
    return ApiResponse.success(res, 200, 'Subjects fetched', []);
  }

  // Narrow to the requested class if provided
  const combos = classId
    ? [{ sessionId, classId }]
    : [...new Map(
        viewableSections.map(s => [`${s.sessionId}|${s.classId}`, { sessionId: s.sessionId, classId: s.classId }])
      ).values()];

  const subjectArrays = await Promise.all(
    combos.map(({ sessionId: sid, classId: cid }) =>
      getFacultyViewableSubjectIds({ facultyId, sessionId: sid, classId: cid })
    )
  );

  const subjectIds = [...new Set(subjectArrays.flat())];

  if (!subjectIds.length) {
    return ApiResponse.success(res, 200, 'Subjects fetched', []);
  }

  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } },
    select: { id: true, name: true, classId: true },
    orderBy: { name: 'asc' },
  });

  return ApiResponse.success(res, 200, 'Subjects fetched', subjects);
});

// GET /faculty/reports/marks
// Frontend sends: examTypeId, subjectId (optional), sectionId (optional)
const getMyMarksReport = asyncHandler(async (req, res) => {
  const { examTypeId, subjectId, sectionId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  if (!examTypeId) {
    return ApiResponse.error(res, 422, 'examTypeId is required');
  }

  const viewableSections = await getFacultyViewableSections({ facultyId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (sectionId && !allowedSectionIds.includes(sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  const report = await analyticsService.getMarksReport({
    schoolId,
    examTypeId,
    subjectId:  subjectId  || undefined,
    sectionIds: sectionId  ? [sectionId] : allowedSectionIds,
  });

  return ApiResponse.success(res, 200, 'Marks report fetched', report);
});

// GET /faculty/reports/students
// Frontend sends: sessionId, classId, sectionId
const getMyStudentsForReports = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, search } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (sectionId && !allowedSectionIds.includes(sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this section');
  }

  let targetSectionIds;
  if (sectionId) {
    targetSectionIds = [sectionId];
  } else if (classId) {
    targetSectionIds = viewableSections.filter(s => s.classId === classId).map(s => s.sectionId);
  } else {
    targetSectionIds = allowedSectionIds;
  }

  if (!targetSectionIds.length) {
    return ApiResponse.success(res, 200, 'Students fetched', []);
  }

  // Students are linked to sections via Enrollment (no direct student.sectionId)
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sectionId: { in: targetSectionIds },
      ...(sessionId ? { sessionId } : {}),
      status: 'active',
      student: { schoolId },
    },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true } },
      section: { select: { id: true, name: true } },
      class:   { select: { name: true } },
    },
    orderBy: { rollNumber: 'asc' },
  });

  const students = enrollments
    .filter(e => !search || e.student.name.toLowerCase().includes(search.toLowerCase()))
    .map(e => ({
      id:               e.student.id,
      name:             e.student.name,
      enrollmentNumber: e.student.enrollmentNumber,
      rollNumber:       e.rollNumber,
      sectionId:        e.section.id,
      sectionName:      e.section.name,
      className:        e.class.name,
    }));

  return ApiResponse.success(res, 200, 'Students fetched', students);
});

// GET /faculty/reports/report-card
const getMyStudentReportCard = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  if (!studentId || !sessionId) {
    return ApiResponse.error(res, 422, 'studentId and sessionId are required');
  }

  // Find student's enrollment to get their sectionId for access check
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, sessionId, student: { schoolId } },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true } },
      section: { select: { id: true, name: true } },
      class:   { select: { id: true, name: true } },
    },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'Student enrollment not found');

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (!allowedSectionIds.includes(enrollment.sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this student');
  }

  // Build report card: all exam types for this class/session, with marks per subject
  const examTypes = await prisma.examType.findMany({
    where: { sessionId, classId: enrollment.classId, schoolId },
    orderBy: { sortOrder: 'asc' },
    include: {
      examSubjects: {
        include: {
          subject: { select: { name: true } },
          marks: {
            where: { enrollmentId: enrollment.id },
            select: { marksObtained: true },
          },
        },
        orderBy: { subject: { name: 'asc' } },
      },
    },
  });

  const reportCard = examTypes.map(et => ({
    examTypeId:      et.id,
    examType:        et.name,
    weightagePercent: et.weightagePercent ?? null,
    subjects: et.examSubjects.map(es => ({
      subject:        es.subject.name,
      marksObtained:  es.marks[0] ? Number(es.marks[0].marksObtained) : null,
      maxMarks:       Number(es.maxMarks),
      passingMarks:   Number(es.passingMarks),
    })),
  }));

  return ApiResponse.success(res, 200, 'Report card fetched', {
    student:          enrollment.student.name,
    enrollmentNumber: enrollment.student.enrollmentNumber,
    class:            enrollment.class.name,
    section:          enrollment.section.name,
    reportCard,
  });
});

// GET /faculty/reports/report-card-pdf
const downloadMyStudentReportCardPDF = asyncHandler(async (req, res) => {
  const { studentId, sessionId, examTypeId } = req.query;
  const facultyId = req.user.id;
  const schoolId = req.schoolId;

  if (!studentId || !sessionId) {
    return ApiResponse.error(res, 422, 'studentId and sessionId are required');
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, sessionId, student: { schoolId } },
  });

  if (!enrollment) return ApiResponse.error(res, 404, 'Student enrollment not found');

  const viewableSections = await getFacultyViewableSections({ facultyId, sessionId });
  const allowedSectionIds = viewableSections.map(s => s.sectionId);

  if (!allowedSectionIds.includes(enrollment.sectionId)) {
    return ApiResponse.error(res, 403, 'Access denied to this student');
  }

  const pdfBuffer = await generateStudentReportCardPDF({ studentId, sessionId, schoolId, examTypeId: examTypeId || undefined });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-card-${studentId}${examTypeId ? '-' + examTypeId : ''}.pdf"`);
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