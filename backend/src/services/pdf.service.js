const PDFDocument = require('pdfkit');
const { prisma } = require('../config/db');

async function generateStudentReportCardPDF({ studentId, sessionId, schoolId, examTypeId }) {
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
    where: { sessionId, classId: enrollment.classId, ...(examTypeId ? { id: examTypeId } : {}) },
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
      .text(
        examTypeId && examTypes[0] ? `${examTypes[0].name.toUpperCase()} — REPORT` : 'STUDENT REPORT CARD',
        M, 63, { width: CW, align: 'center', characterSpacing: 1.2 }
      );

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

// ═══════════════════════════════════════════════════════════════════════════
// Generic branded table report — used by all analytics PDF downloads
// (Marks Report, Attendance Report, Defaulters, Class/Section Performance,
// Student Progress). Same navy/orange theme as the report card above.
// ═══════════════════════════════════════════════════════════════════════════
async function generateTableReportPDF({ schoolId, title, subtitle, metaBadges = [], summaryStats = [], sections = [] }) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });

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
    const TONE = {
      good: [GREEN, GREEN_BG],
      bad: [RED, RED_BG],
      warn: [AMBER, AMBER_BG],
      neutral: [MUTED, HEADER_BG],
    };

    const M        = 40;
    const PAGE_W   = doc.page.width;
    const PAGE_H   = doc.page.height;
    const CW       = PAGE_W - M * 2;
    const FOOTER_Y = PAGE_H - 55;

    let y = M;

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
      .text(String(title || 'Report').toUpperCase(), M, 63, { width: CW, align: 'center', characterSpacing: 1.2 });

    y = 110;

    if (subtitle) {
      doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(subtitle, M, y, { width: CW, align: 'center' });
      y += 20;
    }

    // ── META BADGES ────────────────────────────────────────────────────
    if (metaBadges.length) {
      doc.font('Helvetica-Bold').fontSize(8);
      const pad = 10, gap = 8;
      const widths = metaBadges.map((t) => doc.widthOfString(t) + pad * 2);
      const totalW = widths.reduce((a, b) => a + b, 0) + gap * (metaBadges.length - 1);
      let bx = M + (CW - totalW) / 2;
      metaBadges.forEach((t, i) => {
        doc.roundedRect(bx, y, widths[i], 20, 10).fillAndStroke(HEADER_BG, BORDER);
        doc.fillColor(NAVY).text(t, bx, y + 6, { width: widths[i], align: 'center' });
        bx += widths[i] + gap;
      });
      y += 20 + 16;
    }

    // ── SUMMARY STAT CARDS ─────────────────────────────────────────────
    if (summaryStats.length) {
      const gap = 12;
      const cardW = (CW - gap * (summaryStats.length - 1)) / summaryStats.length;
      const cardH = 50;
      summaryStats.forEach((s, i) => {
        const [color, bg] = TONE[s.tone] || TONE.neutral;
        const cx = M + i * (cardW + gap);
        doc.roundedRect(cx, y, cardW, cardH, 6).fillAndStroke(bg, BORDER);
        doc.font('Helvetica-Bold').fontSize(18).fillColor(color)
          .text(String(s.value), cx, y + 10, { width: cardW, align: 'center' });
        doc.font('Helvetica').fontSize(8).fillColor(TEXT)
          .text(s.label, cx, y + 32, { width: cardW, align: 'center' });
      });
      y += cardH + 20;
    }

    // ── SECTIONS (heading + table) ───────────────────────────────────────
    sections.forEach((section) => {
      newPageIfNeeded(60);

      doc.roundedRect(M, y, CW, 24, 4).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
        .text(String(section.heading || '').toUpperCase(), M + 12, y + 7);
      if (section.note) {
        doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
          .text(section.note, M, y + 8, { width: CW - 14, align: 'right' });
      }
      y += 24;

      const columns = section.columns || [];
      let cursorX = M;
      const colPos = columns.map((col) => {
        const width = col.width * CW;
        const pos = { x: cursorX, width };
        cursorX += width;
        return pos;
      });

      doc.rect(M, y, CW, 20).fill(HEADER_BG);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
      columns.forEach((col, i) => {
        const pos = colPos[i];
        const padL = i === 0 ? 10 : 0;
        const padR = i === columns.length - 1 ? 10 : 0;
        doc.text(String(col.label || '').toUpperCase(), pos.x + padL, y + 6, {
          width: pos.width - padL - padR,
          align: col.align || 'left',
        });
      });
      y += 20;
      hr(y, BORDER, 1);

      const rows = section.rows || [];
      const rowH = 24;

      if (!rows.length) {
        newPageIfNeeded(30);
        doc.font('Helvetica').fontSize(9).fillColor(MUTED)
          .text('No records found', M, y + 10, { width: CW, align: 'center' });
        y += 40;
        return;
      }

      rows.forEach((r, idx) => {
        newPageIfNeeded(rowH + 8);

        doc.rect(M, y, CW, rowH).fill(idx % 2 === 0 ? '#ffffff' : '#fafbfc');

        columns.forEach((col, i) => {
          const pos = colPos[i];
          const padL = i === 0 ? 10 : 0;
          const padR = i === columns.length - 1 ? 10 : 0;

          if (col.badge) {
            const badge = col.badge(r);
            if (badge) {
              const [color, bg] = TONE[badge.tone] || TONE.neutral;
              const pillW = Math.min(pos.width - 16, 74);
              const pillX = pos.x + (pos.width - pillW) / 2;
              doc.roundedRect(pillX, y + 5, pillW, rowH - 10, 8).fill(bg);
              doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color)
                .text(badge.text, pillX, y + 9, { width: pillW, align: 'center' });
              return;
            }
          }

          const displayValue = col.value ? col.value(r) : (r[col.key] != null ? String(r[col.key]) : '—');
          const textColor = col.colorFn ? col.colorFn(r) : TEXT;
          doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(textColor)
            .text(displayValue, pos.x + padL, y + 7, {
              width: pos.width - padL - padR,
              align: col.align || 'left',
            });
        });

        y += rowH;
        hr(y);
      });

      y += 16;
    });

    // ── FOOTER (page number + generated date, on every page) ────────────
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

module.exports = { generateStudentReportCardPDF, generateTableReportPDF };