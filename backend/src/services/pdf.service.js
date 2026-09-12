const PDFDocument = require('pdfkit');
const { prisma } = require('../config/db');

async function generateStudentReportCardPDF({ studentId, sessionId, schoolId }) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, sessionId, student: { schoolId } },
    include: {
      student: true,
      session: true,
      class: true,
      section: true,
    },
  });

  if (!enrollment) throw new Error('Enrollment not found for this student/session');

  const examTypes = await prisma.examType.findMany({
    where: { sessionId, classId: enrollment.classId },
    include: {
      examSubjects: {
        include: {
          subject: { select: { name: true, code: true } },
          marks: { where: { enrollmentId: enrollment.id } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const PRIMARY = '#1e293b';
    const ACCENT = '#f97316';
    const LIGHT = '#f1f5f9';
    const BORDER = '#e2e8f0';
    const pageWidth = 595.28;
    const contentWidth = pageWidth - 100;

    // HEADER
    doc.rect(0, 0, pageWidth, 90).fill(PRIMARY);
    doc.fontSize(22).fillColor('#ffffff').text(school.name, 50, 20, { align: 'center', width: contentWidth });
    doc.fontSize(9).fillColor('#94a3b8').text(school.address || school.contactEmail || '', 50, 48, { align: 'center', width: contentWidth });
    doc.fontSize(12).fillColor(ACCENT).text('STUDENT REPORT CARD', 50, 66, { align: 'center', width: contentWidth });

    doc.y = 110;

    // STUDENT INFO BOX
    doc.rect(50, doc.y, contentWidth, 70).fill(LIGHT).stroke(BORDER);
    const infoY = doc.y + 10;

    doc.fontSize(9).fillColor('#64748b').text('STUDENT NAME', 60, infoY);
    doc.fontSize(11).fillColor(PRIMARY).text(enrollment.student.name, 60, infoY + 12);

    doc.fontSize(9).fillColor('#64748b').text('ENROLLMENT NO.', 220, infoY);
    doc.fontSize(11).fillColor(PRIMARY).text(enrollment.student.enrollmentNumber, 220, infoY + 12);

    doc.fontSize(9).fillColor('#64748b').text('CLASS / SECTION', 370, infoY);
    doc.fontSize(11).fillColor(PRIMARY).text(`${enrollment.class.name} — ${enrollment.section.name}`, 370, infoY + 12);

    doc.fontSize(9).fillColor('#64748b').text('SESSION', 60, infoY + 35);
    doc.fontSize(11).fillColor(PRIMARY).text(enrollment.session.label, 60, infoY + 47);

    doc.fontSize(9).fillColor('#64748b').text('ROLL NO.', 220, infoY + 35);
    doc.fontSize(11).fillColor(PRIMARY).text(enrollment.rollNumber || '—', 220, infoY + 47);

    doc.y = 200;

    // EXAM TABLES
    for (const et of examTypes) {
      if (doc.y > 680) doc.addPage();
      doc.moveDown(0.8);

      // Exam type header bar
      doc.rect(50, doc.y, contentWidth, 22).fill(PRIMARY);
      doc.fontSize(10).fillColor('#ffffff').text(et.name.toUpperCase(), 58, doc.y + 6);
      if (et.weightagePercent) {
        doc.fontSize(8).fillColor('#94a3b8').text(
          `Weightage: ${et.weightagePercent}%`,
          400, doc.y + 8,
          { align: 'right', width: contentWidth - 10 }
        );
      }
      doc.y += 22;

      // Column headers
      const colY = doc.y;
      doc.rect(50, colY, contentWidth, 18).fill(LIGHT).stroke(BORDER);
      doc.fontSize(8).fillColor('#64748b');
      doc.text('SUBJECT', 58, colY + 5);
      doc.text('MAX', 300, colY + 5, { width: 60, align: 'right' });
      doc.text('PASS', 370, colY + 5, { width: 60, align: 'right' });
      doc.text('OBTAINED', 440, colY + 5, { width: 95, align: 'right' });
      doc.text('STATUS', 540, colY + 5, { width: 55, align: 'right' });
      doc.y += 18;

      // Subject rows
      for (const es of et.examSubjects) {
        if (doc.y > 720) doc.addPage();

        const rowY = doc.y;
        const marksObtained = es.marks[0] ? Number(es.marks[0].marksObtained) : null;
        const passed = marksObtained !== null && marksObtained >= Number(es.passingMarks);
        const absent = marksObtained === null;
        const rowBg = absent ? '#fff7ed' : passed ? '#f0fdf4' : '#fef2f2';

        doc.rect(50, rowY, contentWidth, 18).fill(rowBg).stroke(BORDER);
        doc.fontSize(9).fillColor(PRIMARY).text(es.subject.name, 58, rowY + 5);
        doc.fillColor('#475569').text(es.maxMarks.toString(), 300, rowY + 5, { width: 60, align: 'right' });
        doc.text(es.passingMarks.toString(), 370, rowY + 5, { width: 60, align: 'right' });

        if (absent) {
          doc.fillColor('#f97316').text('ABSENT', 440, rowY + 5, { width: 95, align: 'right' });
          doc.fillColor('#f97316').text('—', 540, rowY + 5, { width: 55, align: 'right' });
        } else {
          doc.fillColor(passed ? '#15803d' : '#dc2626').text(marksObtained.toString(), 440, rowY + 5, { width: 95, align: 'right' });
          doc.fillColor(passed ? '#15803d' : '#dc2626').text(passed ? 'PASS' : 'FAIL', 540, rowY + 5, { width: 55, align: 'right' });
        }
        doc.y += 18;
      }

      // Exam total row
      const etMaxTotal = et.examSubjects.reduce((sum, es) => sum + Number(es.maxMarks), 0);
      const etObtainedTotal = et.examSubjects.reduce((sum, es) => sum + (es.marks[0] ? Number(es.marks[0].marksObtained) : 0), 0);
      const etPercent = etMaxTotal > 0 ? ((etObtainedTotal / etMaxTotal) * 100).toFixed(1) : '0.0';

      doc.rect(50, doc.y, contentWidth, 18).fill('#f8fafc').stroke(BORDER);
      doc.fontSize(9).fillColor(PRIMARY).font('Helvetica-Bold').text('TOTAL', 58, doc.y + 5);
      doc.text(`${etObtainedTotal} / ${etMaxTotal}  (${etPercent}%)`, 300, doc.y + 5, { width: 285, align: 'right' });
      doc.font('Helvetica');
      doc.y += 18;
    }

    // GRAND TOTAL
    doc.moveDown(1);
    if (doc.y > 700) doc.addPage();

    const grandMax = examTypes.reduce((sum, et) =>
      sum + et.examSubjects.reduce((s, es) => s + Number(es.maxMarks), 0), 0);
    const grandObtained = examTypes.reduce((sum, et) =>
      sum + et.examSubjects.reduce((s, es) => s + (es.marks[0] ? Number(es.marks[0].marksObtained) : 0), 0), 0);
    const grandPercent = grandMax > 0 ? ((grandObtained / grandMax) * 100).toFixed(2) : '0.00';

    doc.rect(50, doc.y, contentWidth, 30).fill(PRIMARY);
    doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold').text('OVERALL RESULT', 58, doc.y + 9);
    doc.text(
      `${grandObtained} / ${grandMax}  —  ${grandPercent}%`,
      300, doc.y + 9,
      { width: 285, align: 'right' }
    );
    doc.font('Helvetica');
    doc.y += 30;

    // FOOTER
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#94a3b8').text(
      `Generated by CampusSafar AMMS  •  ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      50, doc.y,
      { align: 'center', width: contentWidth }
    );

    doc.end();
  });
}

module.exports = { generateStudentReportCardPDF };