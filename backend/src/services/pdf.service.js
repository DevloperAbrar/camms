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
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // ── THEME ──────────────────────────────────────────────────────────────
    const NAVY      = '#1e293b';
    const ORANGE    = '#f97316';
    const LIGHT     = '#f8fafc';
    const HEADER_BG = '#eef2f7';
    const BORDER    = '#e2e8f0';
    const TEXT      = '#334155';
    const MUTED     = '#94a3b8';
    const GREEN     = '#15803d';
    const GREEN_BG  = '#e9f9ee';
    const RED       = '#dc2626';
    const RED_BG    = '#fdecec';
    const AMBER     = '#b45309';
    const AMBER_BG  = '#fef6e7';

    const M        = 40; // page margin
    const PAGE_W   = doc.page.width;
    const PAGE_H   = doc.page.height;
    const CW       = PAGE_W - M * 2; // usable content width
    const FOOTER_Y = PAGE_H - 55;

    // Fixed column layout shared by every exam table — fractions sum to 1.0
    // so nothing overflows past the right margin.
    const COLS = {
      subject:  { x: M,               width: CW * 0.34 },
      max:      { x: M + CW * 0.34,   width: CW * 0.13 },
      pass:     { x: M + CW * 0.47,   width: CW * 0.13 },
      obtained: { x: M + CW * 0.60,   width: CW * 0.20 },
      status:   { x: M + CW * 0.80,   width: CW * 0.20 },
    };

    let y = M; // our own cursor — never rely on pdfkit's implicit doc.y

    function newPageIfNeeded(need) {
      if (y + need > FOOTER_Y - 10) {
        doc.addPage();
        y = M;
      }
    }

    function hr(atY, color = BORDER, width = 0.5) {
      doc.strokeColor(color).lineWidth(width).moveTo(M, atY).lineTo(M + CW, atY).stroke();
    }

    // ── HEADER BAND ──────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 90).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff')
      .text(school?.name || 'School', M, 20, { width: CW, align: 'center' });
    if (school?.address || school?.contactEmail) {
      doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
        .text(school.address || school.contactEmail, M, 43, { width: CW, align: 'center' });
    }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ORANGE)
      .text('STUDENT REPORT CARD', M, 63, { width: CW, align: 'center', characterSpacing: 1.2 });

    y = 110;

    // ── STUDENT INFO CARD ──────────────────────────────────────────────
    const infoH = 62;
    doc.roundedRect(M, y, CW, infoH, 6).fillAndStroke(LIGHT, BORDER);
    const c1 = M + 16, c2 = M + CW * 0.36, c3 = M + CW * 0.68;
    const r1 = y + 11, r2 = y + 36;

    function field(x, fy, label, value) {
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, x, fy);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(value || '—', x, fy + 11);
    }
    field(c1, r1, 'STUDENT NAME', enrollment.student.name);
    field(c2, r1, 'ENROLLMENT NO.', enrollment.student.enrollmentNumber);
    field(c3, r1, 'CLASS / SECTION', `${enrollment.class.name} — ${enrollment.section.name}`);
    field(c1, r2, 'SESSION', enrollment.session.label);
    field(c2, r2, 'ROLL NO.', enrollment.rollNumber ? String(enrollment.rollNumber) : '—');

    y += infoH + 22;

    // ── EXAM TYPE TABLES ─────────────────────────────────────────────────
    for (const et of examTypes) {
      newPageIfNeeded(100);

      // Section header bar
      doc.roundedRect(M, y, CW, 24, 4).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
        .text(et.name.toUpperCase(), M + 12, y + 7);
      if (et.weightagePercent != null) {
        doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
          .text(`Weightage ${et.weightagePercent}%`, M, y + 8, { width: CW - 14, align: 'right' });
      }
      y += 24;

      // Column header row
      doc.rect(M, y, CW, 20).fill(HEADER_BG);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
      doc.text('SUBJECT', COLS.subject.x + 10, y + 6, { width: COLS.subject.width - 10 });
      doc.text('MAX', COLS.max.x, y + 6, { width: COLS.max.width, align: 'center' });
      doc.text('PASS', COLS.pass.x, y + 6, { width: COLS.pass.width, align: 'center' });
      doc.text('OBTAINED', COLS.obtained.x, y + 6, { width: COLS.obtained.width, align: 'center' });
      doc.text('STATUS', COLS.status.x, y + 6, { width: COLS.status.width - 10, align: 'center' });
      y += 20;
      hr(y, BORDER, 1);

      // Subject rows
      const rowH = 24;
      et.examSubjects.forEach((es, idx) => {
        newPageIfNeeded(rowH + 8);

        const marksObtained = es.marks[0] ? Number(es.marks[0].marksObtained) : null;
        const pending = marksObtained === null;
        const passed = !pending && marksObtained >= Number(es.passingMarks);

        const statusColor = pending ? AMBER : passed ? GREEN : RED;
        const statusBg    = pending ? AMBER_BG : passed ? GREEN_BG : RED_BG;
        const statusText  = pending ? 'PENDING' : passed ? 'PASS' : 'FAIL';

        // Zebra striping for the row, plus a colored status pill on the right
        doc.rect(M, y, CW, rowH).fill(idx % 2 === 0 ? '#ffffff' : '#fafbfc');

        doc.font('Helvetica').fontSize(9.5).fillColor(TEXT)
          .text(es.subject.name, COLS.subject.x + 10, y + 7, { width: COLS.subject.width - 10 });
        doc.fillColor('#64748b')
          .text(String(es.maxMarks), COLS.max.x, y + 7, { width: COLS.max.width, align: 'center' })
          .text(String(es.passingMarks), COLS.pass.x, y + 7, { width: COLS.pass.width, align: 'center' });
        doc.font('Helvetica-Bold').fillColor(pending ? MUTED : statusColor)
          .text(pending ? '—' : String(marksObtained), COLS.obtained.x, y + 7, { width: COLS.obtained.width, align: 'center' });

        const pillW = COLS.status.width - 20;
        const pillX = COLS.status.x + 10;
        doc.roundedRect(pillX, y + 5, pillW, rowH - 10, 8).fill(statusBg);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(statusColor)
          .text(statusText, pillX, y + 9, { width: pillW, align: 'center' });

        y += rowH;
        hr(y);
      });

      // Exam total row
      const etMaxTotal = et.examSubjects.reduce((s, es) => s + Number(es.maxMarks), 0);
      const etObtainedTotal = et.examSubjects.reduce((s, es) => s + (es.marks[0] ? Number(es.marks[0].marksObtained) : 0), 0);
      const etPercent = etMaxTotal > 0 ? ((etObtainedTotal / etMaxTotal) * 100).toFixed(1) : '0.0';

      newPageIfNeeded(30);
      doc.rect(M, y, CW, 26).fill(HEADER_BG);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
        .text('TOTAL', COLS.subject.x + 10, y + 8, { width: COLS.subject.width - 10 });
      doc.text(`${etObtainedTotal} / ${etMaxTotal}`, COLS.obtained.x, y + 8, { width: COLS.obtained.width, align: 'center' });
      doc.fillColor(ORANGE).text(`${etPercent}%`, COLS.status.x, y + 8, { width: COLS.status.width - 10, align: 'center' });
      y += 26 + 16;
    }

    // ── OVERALL RESULT BANNER ───────────────────────────────────────────
    newPageIfNeeded(54);
    const grandMax = examTypes.reduce((s, et) => s + et.examSubjects.reduce((x, es) => x + Number(es.maxMarks), 0), 0);
    const grandObtained = examTypes.reduce((s, et) => s + et.examSubjects.reduce((x, es) => x + (es.marks[0] ? Number(es.marks[0].marksObtained) : 0), 0), 0);
    const grandPercent = grandMax > 0 ? ((grandObtained / grandMax) * 100).toFixed(2) : '0.00';
    const overallPass = grandMax > 0 && (grandObtained / grandMax) >= 0.33;

    doc.roundedRect(M, y, CW, 42, 6).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
      .text('OVERALL RESULT', M + 16, y + 15);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ORANGE)
      .text(`${grandObtained} / ${grandMax}   (${grandPercent}%)`, M, y + 15, { width: CW - 90, align: 'right' });
    doc.roundedRect(M + CW - 74, y + 9, 58, 24, 5).fill(overallPass ? '#16a34a' : '#dc2626');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
      .text(overallPass ? 'PASS' : 'FAIL', M + CW - 74, y + 16, { width: 58, align: 'center' });

    y += 42;

    // ── FOOTER (page number + generated date, on every page) ────────────
    // Drawing this close to the bottom edge would normally trigger pdfkit's
    // automatic page-break check (it fires whenever text would cross the
    // page's default bottom margin, even with an explicit y). Zeroing the
    // margin for this one block stops it from spawning phantom blank pages.
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      hr(FOOTER_Y, BORDER, 0.75);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(
          `Generated by CampusSafar AMMS  •  ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
          M, FOOTER_Y + 10, { width: CW / 2, lineBreak: false }
        );
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, M + CW / 2, FOOTER_Y + 10, { width: CW / 2, align: 'right', lineBreak: false });
    }

    doc.page.margins.bottom = savedBottomMargin;

    doc.end();
  });
}

module.exports = { generateStudentReportCardPDF };