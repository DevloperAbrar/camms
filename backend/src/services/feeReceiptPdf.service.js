const PDFDocument = require('pdfkit');
const { amountInWords } = require('../utils/amountInWords');

const NAVY = '#1e293b';
const ORANGE = '#f97316';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const HEAD_BG = '#eef2f7';
const RED = '#dc2626';

const MODE_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card', cheque: 'Cheque', bank_transfer: 'Bank Transfer', dd: 'Demand Draft', other: 'Other' };
const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-');
  return `${day}-${m}-${y}`;
};

const ROW_H = 11;
const FIXED_H = 272; // everything on a receipt except the item rows

// One receipt copy drawn inside the box (x, y, w, h)
function drawCopy(doc, ctx, x, y, w, h, copyLabel) {
  const { receipt, header, settings, logo } = ctx;
  const PAD = 12;
  const left = x + PAD;
  const inner = w - PAD * 2;
  const line = (yy, color = BORDER, lw = 0.6) => doc.strokeColor(color).lineWidth(lw).moveTo(left, yy).lineTo(left + inner, yy).stroke();
  const txt = (s, tx, ty, o = {}) => doc.text(String(s ?? ''), tx, ty, { lineBreak: false, ...o });
  const oneLine = (s, tx, ty, tw, size, font = 'Helvetica', color = NAVY, align = 'left') => {
    doc.font(font).fontSize(size).fillColor(color).text(String(s ?? ''), tx, ty, { width: tw, height: size + 2, ellipsis: true, align });
  };

  doc.save();
  doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(BORDER).stroke();

  // header: logo + school identity
  let cy = y + 10;
  let textX = left;
  let textW = inner;
  if (logo) {
    try {
      doc.image(logo, left, cy, { fit: [46, 46] });
      textX = left + 56;
      textW = inner - 56;
    } catch { /* unreadable image: print without logo */ }
  }
  oneLine(header.name, textX, cy, textW, 14, 'Helvetica-Bold', NAVY);
  cy += 17;
  if (header.tagline) { oneLine(header.tagline, textX, cy, textW, 8, 'Helvetica-Oblique', MUTED); cy += 10; }
  if (header.address) { oneLine(header.address, textX, cy, textW, 8, 'Helvetica', MUTED); cy += 10; }
  const contact = [header.phone, header.email, header.website].filter(Boolean).join('   |   ');
  if (contact) { oneLine(contact, textX, cy, textW, 8, 'Helvetica', MUTED); cy += 10; }
  const ids = [
    header.gstEnabled && header.gstin ? `GSTIN: ${header.gstin}` : null,
    header.pan ? `PAN: ${header.pan}` : null,
    ...(header.headerFields || []).map((f) => `${f.label}: ${f.value}`),
  ].filter(Boolean).join('   |   ');
  if (ids) { oneLine(ids, textX, cy, textW, 7.5, 'Helvetica-Bold', NAVY); cy += 10; }
  cy = Math.max(cy, y + 62);
  line(cy, NAVY, 1);
  cy += 6;

  // title row
  oneLine('FEE RECEIPT', left, cy, inner / 2, 11, 'Helvetica-Bold', NAVY);
  oneLine(copyLabel, left + inner / 2, cy + 2, inner / 2, 8, 'Helvetica-Bold', ORANGE, 'right');
  cy += 16;
  oneLine(`Receipt No: ${receipt.receiptNo}`, left, cy, inner / 2, 9, 'Helvetica-Bold', NAVY);
  oneLine(`Date: ${fmtDate(receipt.paymentDate)}`, left + inner / 2, cy, inner / 2, 9, 'Helvetica-Bold', NAVY, 'right');
  cy += 14;

  // student block
  doc.roundedRect(left, cy, inner, 40, 4).lineWidth(0.5).strokeColor(BORDER).stroke();
  const cw = inner / 3;
  const cell = (label, value, col, row) => {
    const cx = left + 8 + col * cw;
    const cyy = cy + 5 + row * 18;
    oneLine(label, cx, cyy, cw - 10, 6.5, 'Helvetica', MUTED);
    oneLine(value || '-', cx, cyy + 7, cw - 10, 8.5, 'Helvetica-Bold', NAVY);
  };
  cell('STUDENT NAME', receipt.studentName, 0, 0);
  cell('ENROLLMENT NO.', receipt.enrollmentNumber, 1, 0);
  cell('CLASS / SECTION', [receipt.className, receipt.sectionName].filter(Boolean).join(' - '), 2, 0);
  cell('PARENT NAME', receipt.parentName, 0, 1);
  cell('SESSION', receipt.sessionLabel, 1, 1);
  cell('ROLL NO.', receipt.rollNumber, 2, 1);
  cy += 46;

  // items table
  const amtW = 90;
  doc.rect(left, cy, inner, 13).fill(HEAD_BG);
  oneLine('#', left + 4, cy + 3, 20, 7, 'Helvetica-Bold', MUTED);
  oneLine('PARTICULARS', left + 26, cy + 3, inner - amtW - 30, 7, 'Helvetica-Bold', MUTED);
  oneLine('AMOUNT (Rs.)', left + inner - amtW - 4, cy + 3, amtW, 7, 'Helvetica-Bold', MUTED, 'right');
  cy += 13;

  const rows = receipt.items.map((i) => ({ title: i.title, amount: i.amount }));
  if (receipt.lateFeeTotal > 0) rows.push({ title: 'Late Fee', amount: receipt.lateFeeTotal });
  const maxRows = Math.max(1, Math.floor((h - FIXED_H) / ROW_H));
  const shown = rows.length > maxRows ? rows.slice(0, maxRows - 1) : rows;
  shown.forEach((r, idx) => {
    oneLine(idx + 1, left + 4, cy + 2, 20, 7.5, 'Helvetica', MUTED);
    oneLine(r.title, left + 26, cy + 2, inner - amtW - 30, 8, 'Helvetica', NAVY);
    oneLine(inr(r.amount), left + inner - amtW - 4, cy + 2, amtW, 8, 'Helvetica', NAVY, 'right');
    cy += ROW_H;
    line(cy, '#e2e8f0', 0.4);
  });
  if (shown.length < rows.length) {
    const rest = rows.slice(shown.length).reduce((s, r) => s + r.amount, 0);
    oneLine(`+ ${rows.length - shown.length} more items`, left + 26, cy + 2, inner - amtW - 30, 8, 'Helvetica-Oblique', MUTED);
    oneLine(inr(rest), left + inner - amtW - 4, cy + 2, amtW, 8, 'Helvetica', NAVY, 'right');
    cy += ROW_H;
  }

  // total
  doc.rect(left, cy, inner, 18).fill(NAVY);
  oneLine('TOTAL PAID', left + 8, cy + 5, inner / 2, 9, 'Helvetica-Bold', '#ffffff');
  oneLine(`Rs. ${inr(receipt.totalAmount)}`, left + inner - amtW - 10, cy + 5, amtW + 6, 9.5, 'Helvetica-Bold', '#ffffff', 'right');
  cy += 24;

  // words, payment, balance
  oneLine(`Amount in words: ${amountInWords(receipt.totalAmount)}`, left, cy, inner, 8, 'Helvetica-Bold', NAVY);
  cy += 11;
  const mode = [
    `Mode: ${MODE_LABEL[receipt.paymentMode] || receipt.paymentMode}`,
    receipt.referenceNo ? `Ref: ${receipt.referenceNo}` : null,
    receipt.bankName ? `Bank: ${receipt.bankName}` : null,
    receipt.instrumentDate ? `Inst. Date: ${fmtDate(receipt.instrumentDate)}` : null,
  ].filter(Boolean).join('   |   ');
  oneLine(mode, left, cy, inner, 8, 'Helvetica', MUTED);
  cy += 11;
  const notes = [
    header.gstEnabled && receipt.taxIncluded > 0 ? `GST included in fees: Rs. ${inr(receipt.taxIncluded)}` : null,
    settings.showBalanceOnReceipt ? `Balance due (till date): Rs. ${inr(receipt.balanceAfter)}` : null,
    receipt.remarks ? `Remarks: ${receipt.remarks}` : null,
  ].filter(Boolean).join('   |   ');
  if (notes) { oneLine(notes, left, cy, inner, 8, 'Helvetica', MUTED); cy += 11; }
  if (settings.showBankOnReceipt && (settings.bankName || settings.upiId)) {
    const bank = [
      settings.bankName ? `Bank: ${settings.bankName}` : null,
      settings.accountNumber ? `A/c: ${settings.accountNumber}` : null,
      settings.ifscCode ? `IFSC: ${settings.ifscCode}` : null,
      settings.upiId ? `UPI: ${settings.upiId}` : null,
    ].filter(Boolean).join('   |   ');
    oneLine(bank, left, cy, inner, 7.5, 'Helvetica', MUTED);
    cy += 10;
  }
  if (settings.termsText) {
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(settings.termsText, left, cy, { width: inner, height: 18, ellipsis: true });
  }

  // signature strip pinned to bottom of the box
  const sy = y + h - 30;
  oneLine(`Received by: ${receipt.collectedByName || '-'}`, left, sy + 14, inner / 2, 8, 'Helvetica', MUTED);
  doc.strokeColor(MUTED).lineWidth(0.5).moveTo(left + inner - 140, sy + 10).lineTo(left + inner, sy + 10).stroke();
  oneLine(header.signatureLabel || 'Authorised Signatory', left + inner - 140, sy + 14, 140, 8, 'Helvetica-Bold', NAVY, 'center');

  // cancelled watermark
  if (receipt.status === 'cancelled') {
    doc.save();
    doc.rotate(-25, { origin: [x + w / 2, y + h / 2] });
    doc.fillOpacity(0.18).font('Helvetica-Bold').fontSize(56).fillColor(RED);
    txt('CANCELLED', x + w / 2 - 250, y + h / 2 - 28, { width: 500, align: 'center' });
    doc.restore();
  }
  doc.restore();
}

// receipt: serialized receipt incl. items (+ snapshot). copies: 1 | 2
function generateFeeReceiptPDF({ receipt, settings, school, copies = 2 }) {
  const snap = receipt.snapshot || {};
  const header = {
    name: snap.name || settings.displayName || school.name,
    tagline: snap.tagline ?? settings.tagline,
    address: snap.address ?? (settings.address || school.address),
    phone: snap.phone ?? (settings.phone || school.contactPhone),
    email: snap.email ?? (settings.email || school.contactEmail),
    website: snap.website ?? settings.website,
    gstEnabled: snap.gstEnabled ?? settings.gstEnabled,
    gstin: snap.gstin ?? settings.gstin,
    pan: snap.pan ?? settings.panNumber,
    headerFields: snap.headerFields ?? settings.headerFields,
    signatureLabel: snap.signatureLabel || settings.signatureLabel,
  };
  const logo = settings.logoData ? Buffer.from(settings.logoData) : null;
  const ctx = { receipt, header, settings, logo };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const M = 24;
    const labels = ['PARENT COPY', 'OFFICE COPY'];
    const rowCount = receipt.items.length + (receipt.lateFeeTotal > 0 ? 1 : 0);
    const halfH = (PH - M * 2 - 12) / 2;
    const fitsHalf = rowCount <= Math.floor((halfH - FIXED_H) / ROW_H);

    if (copies === 2 && fitsHalf) {
      // Both copies on ONE A4 page
      drawCopy(doc, ctx, M, M, PW - M * 2, halfH, labels[0]);
      doc.save().dash(4, { space: 3 }).strokeColor(BORDER).lineWidth(0.6).moveTo(M, M + halfH + 6).lineTo(PW - M, M + halfH + 6).stroke().undash().restore();
      drawCopy(doc, ctx, M, M + halfH + 12, PW - M * 2, halfH, labels[1]);
    } else {
      // Single copy, or a very long receipt (11+ lines): one copy per page so nothing is cut
      for (let i = 0; i < copies; i += 1) {
        if (i > 0) doc.addPage();
        drawCopy(doc, ctx, M, M, PW - M * 2, copies === 1 ? halfH + 40 : PH - M * 2, labels[i]);
      }
    }
    doc.end();
  });
}

module.exports = { generateFeeReceiptPDF };