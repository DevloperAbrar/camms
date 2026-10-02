const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');
const { prisma } = require('../../config/db');
const { generateFeeReceiptPDF } = require('../../services/feeReceiptPdf.service');
const { generateTableReportPDF } = require('../../services/pdf.service');
const {
  num, r2, toDateStr, todayInTz, normalizeSettings, serializeCharge, serializeReceipt, syncCharges,
} = require('../../services/fee.service');

const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Parent JWT has no schoolId, so everything is resolved from the (already verified) child's school.
async function loadContext(student) {
  const school = await prisma.school.findUnique({ where: { id: student.schoolId } });
  if (!school) return null;

  const sub = await prisma.schoolSubscription.findFirst({
    where: { schoolId: school.id },
    orderBy: { endDate: 'desc' },
    include: { plan: { select: { features: true } } },
  });
  const features = (sub && sub.plan && sub.plan.features) || {};
  if (features.feeManagement === false) return { disabled: true };

  const existing = await prisma.feeSettings.findUnique({ where: { schoolId: school.id } });
  const row = existing || (await prisma.feeSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: { schoolId: school.id, displayName: school.name, copiesPerReceipt: 1 },
  }));

  const tz = school.timezone || 'Asia/Kolkata';
  return { school, settings: normalizeSettings(row), today: todayInTz(tz) };
}

const getChildFees = asyncHandler(async (req, res) => {
  const { student } = req;
  const ctx = await loadContext(student);
  if (!ctx) return ApiResponse.error(res, 404, 'School not found');
  if (ctx.disabled) return ApiResponse.error(res, 403, 'Fee details are not available for this school');
  const { settings, today } = ctx;

  const full = await prisma.student.findUnique({
    where: { id: student.id },
    include: { enrollments: { include: { class: true, section: true, session: true }, orderBy: { session: { startDate: 'desc' } } } },
  });

  // Make sure dues for any new admission exist before showing them (idempotent)
  const bySession = {};
  full.enrollments.filter((e) => e.status === 'active').forEach((e) => { (bySession[e.sessionId] = bySession[e.sessionId] || []).push(e.id); });
  for (const [sessionId, enrollmentIds] of Object.entries(bySession)) {
    try { await syncCharges({ schoolId: student.schoolId, sessionId, enrollmentIds }); } catch (err) { logger.warn(`Parent fee sync failed: ${err.message}`); }
  }

  const [rawCharges, receipts] = await Promise.all([
    prisma.studentFeeCharge.findMany({
      where: { schoolId: student.schoolId, enrollment: { studentId: student.id } },
      include: { feeHead: { select: { name: true } }, enrollment: { select: { sessionId: true, session: { select: { label: true, startDate: true } } } } },
    }),
    prisma.feeReceipt.findMany({
      where: { schoolId: student.schoolId, studentId: student.id },
      include: { items: { orderBy: { position: 'asc' } } },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
  ]);

  rawCharges.sort((a, b) => a.enrollment.session.startDate - b.enrollment.session.startDate || a.dueDate - b.dueDate || a.title.localeCompare(b.title));
  const charges = rawCharges.map((c) => serializeCharge(c, settings, today));

  const current = full.enrollments[0] || null;
  const open = charges.filter((c) => c.balance > 0);
  const totals = {
    dueNow: r2(open.filter((c) => c.dueDate <= today).reduce((s, c) => s + c.balance, 0)),
    lateFee: r2(open.reduce((s, c) => s + c.lateFee, 0)),
    upcoming: r2(open.filter((c) => c.dueDate > today).reduce((s, c) => s + c.balance, 0)),
    previousDue: r2(open.filter((c) => current && c.sessionId !== current.sessionId && c.dueDate <= today).reduce((s, c) => s + c.balance, 0)),
    paid: r2(charges.reduce((s, c) => s + c.paid, 0)),
    outstanding: r2(open.reduce((s, c) => s + c.balance, 0)),
  };

  return ApiResponse.success(res, 200, 'Fees fetched', {
    school: { name: settings.displayName || ctx.school.name },
    today,
    student: { id: student.id, name: student.name, enrollmentNumber: student.enrollmentNumber },
    enrollment: current && {
      sessionId: current.sessionId, sessionLabel: current.session.label,
      className: current.class.name, sectionName: current.section.name,
    },
    totals,
    charges,
    receipts: receipts.map(serializeReceipt),
    payAtSchool: true,
  });
});

const receiptPdf = asyncHandler(async (req, res) => {
  const { student } = req;
  const ctx = await loadContext(student);
  if (!ctx || ctx.disabled) return ApiResponse.error(res, 403, 'Fee details are not available for this school');

  // Receipt must belong to THIS verified child
  const receipt = await prisma.feeReceipt.findFirst({
    where: { id: req.params.receiptId, schoolId: student.schoolId, studentId: student.id },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!receipt) return ApiResponse.error(res, 404, 'Receipt not found');

  const pdf = await generateFeeReceiptPDF({
    receipt: { ...serializeReceipt(receipt), snapshot: receipt.snapshot },
    settings: ctx.settings,
    school: ctx.school,
    copies: 1,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${receipt.receiptNo.replace(/[^A-Za-z0-9-]/g, '-')}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.end(pdf);
});

const statementPdf = asyncHandler(async (req, res) => {
  const { student } = req;
  const ctx = await loadContext(student);
  if (!ctx || ctx.disabled) return ApiResponse.error(res, 403, 'Fee details are not available for this school');
  const { settings, today } = ctx;

  const full = await prisma.student.findUnique({
    where: { id: student.id },
    include: { enrollments: { include: { class: true, section: true, session: true }, orderBy: { session: { startDate: 'desc' } } } },
  });
  const sessionId = req.query.sessionId || (full.enrollments[0] && full.enrollments[0].sessionId);
  const en = full.enrollments.find((e) => e.sessionId === sessionId) || full.enrollments[0];

  const [raw, receipts] = await Promise.all([
    prisma.studentFeeCharge.findMany({
      where: { schoolId: student.schoolId, enrollment: { studentId: student.id, sessionId } },
      include: { feeHead: { select: { name: true } } },
      orderBy: [{ dueDate: 'asc' }],
    }),
    prisma.feeReceipt.findMany({ where: { schoolId: student.schoolId, studentId: student.id, status: 'active' }, orderBy: { paymentDate: 'asc' } }),
  ]);
  const charges = raw.map((c) => serializeCharge(c, settings, today));
  const billed = r2(charges.reduce((s, c) => s + c.amount - c.discount, 0));
  const paid = r2(charges.reduce((s, c) => s + c.paid, 0));
  const tone = { paid: 'good', partial: 'warn', pending: 'bad' };

  const pdf = await generateTableReportPDF({
    schoolId: student.schoolId,
    title: 'Fee Statement',
    subtitle: `${student.name}  |  ${student.enrollmentNumber}${en ? `  |  ${en.class.name} - ${en.section.name}` : ''}`,
    metaBadges: en ? [`Session ${en.session.label}`, `As on ${today}`] : [`As on ${today}`],
    summaryStats: [
      { label: 'Total Payable', value: inr(billed), tone: 'neutral' },
      { label: 'Paid', value: inr(paid), tone: 'good' },
      { label: 'Balance', value: inr(r2(billed - paid)), tone: billed - paid > 0 ? 'bad' : 'good' },
    ],
    sections: [
      {
        heading: 'Fee Ledger',
        columns: [
          { label: 'Particulars', width: 0.28, key: 'title' },
          { label: 'Due Date', width: 0.11, key: 'dueDate', align: 'center' },
          { label: 'Amount', width: 0.12, align: 'right', value: (r) => inr(r.amount) },
          { label: 'Concession', width: 0.12, align: 'right', value: (r) => inr(r.discount) },
          { label: 'Paid', width: 0.12, align: 'right', value: (r) => inr(r.paid) },
          { label: 'Balance', width: 0.12, align: 'right', bold: true, value: (r) => inr(r.balance) },
          { label: 'Status', width: 0.13, align: 'center', badge: (r) => ({ text: r.status.toUpperCase(), tone: tone[r.status] || 'neutral' }) },
        ],
        rows: charges,
      },
      {
        heading: 'Payments Received',
        columns: [
          { label: 'Receipt No.', width: 0.30, key: 'receiptNo' },
          { label: 'Date', width: 0.16, align: 'center', value: (r) => toDateStr(r.paymentDate) },
          { label: 'Mode', width: 0.18, align: 'center', value: (r) => r.paymentMode.replace('_', ' ').toUpperCase() },
          { label: 'Collected By', width: 0.18, key: 'collectedByName' },
          { label: 'Amount', width: 0.18, align: 'right', bold: true, value: (r) => inr(num(r.totalAmount)) },
        ],
        rows: receipts,
      },
    ],
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fee-statement-${student.enrollmentNumber}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.end(pdf);
});

module.exports = { getChildFees, receiptPdf, statementPdf };