const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { generateStudentReportCardPDF } = require('../../services/pdf.service');

const downloadReportCardPDF = asyncHandler(async (req, res) => {
  const { studentId, sessionId } = req.query;

  if (!studentId || !sessionId) {
    return ApiResponse.error(res, 422, 'studentId and sessionId are required');
  }

  const pdfBuffer = await generateStudentReportCardPDF({
    studentId,
    sessionId,
    schoolId: req.schoolId,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report-card-${studentId}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.end(pdfBuffer);
});

module.exports = { downloadReportCardPDF };