const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const archiver = require('archiver');
const { prisma } = require('../../config/db');
const { generateStudentReportCardPDF } = require('../../services/pdf.service');

const downloadReportCardPDF = asyncHandler(async (req, res) => {
  const { studentId, sessionId, examTypeId } = req.query;

  if (!studentId || !sessionId) {
    return ApiResponse.error(res, 422, 'studentId and sessionId are required');
  }

  const pdfBuffer = await generateStudentReportCardPDF({
    studentId,
    sessionId,
    schoolId: req.schoolId,
    examTypeId: examTypeId || undefined,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report-card-${studentId}${examTypeId ? '-' + examTypeId : ''}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.end(pdfBuffer);
});

// GET /schooladmin/analytics/bulk-report-cards-pdf
// Generates one branded PDF per student (same engine as the single download)
// and streams them all back as a single .zip — a real "Bulk Download" instead
// of the CSV-only version that existed before.
const downloadBulkReportCardsZip = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      status: 'active',
      student: { schoolId: req.schoolId },
    },
    include: { student: { select: { id: true, name: true, enrollmentNumber: true } } },
    orderBy: { rollNumber: 'asc' },
  });

  if (!enrollments.length) {
    return ApiResponse.error(res, 404, 'No students found for this filter');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="report-cards-${sessionId}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { throw err; });
  archive.pipe(res);

  const usedNames = new Set();
  for (const enr of enrollments) {
    try {
      const pdfBuffer = await generateStudentReportCardPDF({
        studentId: enr.student.id,
        sessionId,
        schoolId: req.schoolId,
      });
      const safeName = (enr.student.name || 'student').replace(/[^a-z0-9]+/gi, '-');
      let filename = `${safeName}-${enr.student.enrollmentNumber || enr.student.id}.pdf`;
      let n = 1;
      while (usedNames.has(filename)) filename = `${safeName}-${enr.student.enrollmentNumber || enr.student.id}-${++n}.pdf`;
      usedNames.add(filename);
      archive.append(pdfBuffer, { name: filename });
    } catch (err) {
      // Skip a single student's failure rather than aborting the whole batch.
    }
  }

  await archive.finalize();
});

module.exports = { downloadReportCardPDF, downloadBulkReportCardsZip };