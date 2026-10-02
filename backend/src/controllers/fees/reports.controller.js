const { stringify } = require('csv-stringify/sync');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { generateTableReportPDF } = require('../../services/pdf.service');
const { createBulkNotifications } = require('../../services/notification.service');
const { remindSchema } = require('../../validators/fee.validator');
const {
  num, r2, balanceOf, toDateOnly, toDateStr, buildReceiptWhere, serializeReceipt, getActiveSession,
} = require('../../services/fee.service');
const { buildStudentRows } = require('./collection.controller');

const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MODE = (m) => String(m || '').replace('_', ' ').toUpperCase();

const sendPdf = (res, buf, name) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', buf.length);
  return res.end(buf);
};
const sendCsv = (res, rows, name) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.send(`\uFEFF${stringify(rows, { header: true })}`);
};

// ───────── dashboard + analytics ─────────
const getDashboard = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const { today } = req.fee;

  const session = req.query.sessionId
    ? await prisma.academicSession.findFirst({ where: { id: req.query.sessionId, schoolId } })
    : await getActiveSession(schoolId);

  const todayDate = toDateOnly(today);
  const monthStart = toDateOnly(`${today.slice(0, 8)}01`);
  const trendStart = new Date(todayDate.getTime() - 29 * 86400000);
  const live = { schoolId, status: 'active' };
  const monthWhere = { ...live, paymentDate: { gte: monthStart, lte: todayDate } };
  const sums = { _sum: { totalAmount: true }, _count: { _all: true } };

  const [todayAgg, monthAgg, modes, trend, collectors, recent, charges] = await Promise.all([
    prisma.feeReceipt.aggregate({ where: { ...live, paymentDate: todayDate }, ...sums }),
    prisma.feeReceipt.aggregate({ where: monthWhere, ...sums }),
    prisma.feeReceipt.groupBy({ by: ['paymentMode'], where: monthWhere, ...sums }),
    prisma.feeReceipt.groupBy({ by: ['paymentDate'], where: { ...live, paymentDate: { gte: trendStart, lte: todayDate } }, _sum: { totalAmount: true } }),
    prisma.feeReceipt.groupBy({ by: ['collectedById', 'collectedByName'], where: monthWhere, ...sums }),
    prisma.feeReceipt.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    session
      ? prisma.studentFeeCharge.findMany({
        where: { schoolId, enrollment: { sessionId: session.id } },
        select: {
          amount: true, discount: true, paidAmount: true, dueDate: true, enrollmentId: true,
          enrollment: {
            select: {
              classId: true,
              class: { select: { name: true, sortOrder: true } },
              section: { select: { name: true } },
              student: { select: { id: true, name: true, enrollmentNumber: true, parentPhone: true } },
            },
          },
        },
      })
      : Promise.resolve([]),
  ]);

  const trendMap = Object.fromEntries(trend.map((t) => [toDateStr(t.paymentDate), num(t._sum.totalAmount)]));
  const trendOut = Array.from({ length: 30 }, (_, i) => {
    const d = toDateStr(new Date(trendStart.getTime() + i * 86400000));
    return { date: d, amount: trendMap[d] || 0 };
  });

  let billed = 0; let collected = 0; let dueNow = 0; let upcoming = 0;
  const classMap = {};
  const stuMap = {};
  charges.forEach((c) => {
    const net = num(c.amount) - num(c.discount);
    const paid = num(c.paidAmount);
    const bal = r2(net - paid);
    const isDue = bal > 0 && toDateStr(c.dueDate) <= today;
    billed += net;
    collected += paid;
    if (bal > 0) { if (isDue) dueNow += bal; else upcoming += bal; }

    const en = c.enrollment;
    const cl = (classMap[en.classId] ||= { className: en.class.name, order: en.class.sortOrder, billed: 0, collected: 0, due: 0 });
    cl.billed += net; cl.collected += paid; if (isDue) cl.due += bal;
    if (isDue) {
      const s = (stuMap[c.enrollmentId] ||= {
        studentId: en.student.id, name: en.student.name, enrollmentNumber: en.student.enrollmentNumber,
        className: en.class.name, sectionName: en.section.name, parentPhone: en.student.parentPhone, due: 0,
      });
      s.due += bal;
    }
  });

  const defaulters = Object.values(stuMap).map((s) => ({ ...s, due: r2(s.due) })).sort((a, b) => b.due - a.due);

  return ApiResponse.success(res, 200, 'Fee dashboard fetched', {
    session: session ? { id: session.id, label: session.label } : null,
    today: { amount: num(todayAgg._sum.totalAmount), count: todayAgg._count._all },
    month: { amount: num(monthAgg._sum.totalAmount), count: monthAgg._count._all },
    totals: {
      billed: r2(billed), collected: r2(collected), outstanding: r2(billed - collected),
      dueNow: r2(dueNow), upcoming: r2(upcoming),
      collectionRate: billed > 0 ? r2((collected / billed) * 100) : 0,
    },
    overdueStudents: defaulters.length,
    trend: trendOut,
    byMode: modes.map((m) => ({ mode: m.paymentMode, total: num(m._sum.totalAmount), count: m._count._all })),
    byClass: Object.values(classMap).sort((a, b) => a.order - b.order)
      .map((c) => ({ className: c.className, billed: r2(c.billed), collected: r2(c.collected), due: r2(c.due) })),
    collectors: collectors.map((c) => ({ id: c.collectedById, name: c.collectedByName, total: num(c._sum.totalAmount), count: c._count._all })),
    topDefaulters: defaulters.slice(0, 10),
    recent: recent.map(serializeReceipt),
  });
});

// ───────── dues exports + reminders ─────────
const exportDuesCsv = asyncHandler(async (req, res) => {
  const { rows } = await buildStudentRows(req, { status: 'overdue', sort: 'due' });
  return sendCsv(res, rows.map((r) => ({
    'Enrollment No': r.enrollmentNumber, Student: r.name, Class: r.className, Section: r.sectionName,
    Roll: r.rollNumber || '', Parent: r.parentName || '', Phone: r.parentPhone || '',
    'Due Till Date': r.dueNow, 'Previous Dues': r.arrears, 'Total Due': r.totalDue,
  })), 'fee-dues.csv');
});

const duesPdf = asyncHandler(async (req, res) => {
  const { rows, summary } = await buildStudentRows(req, { status: 'overdue', sort: 'due' });
  const pdf = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Fee Dues Report',
    subtitle: `Pending fees as on ${req.fee.today}`,
    summaryStats: [
      { label: 'Defaulters', value: rows.length, tone: 'bad' },
      { label: 'Total Due', value: inr(summary.due), tone: 'bad' },
    ],
    sections: [{
      heading: 'Students with pending fees',
      columns: [
        { label: 'Student', width: 0.24, key: 'name', bold: true },
        { label: 'Adm. No.', width: 0.14, key: 'enrollmentNumber' },
        { label: 'Class', width: 0.15, value: (r) => `${r.className} ${r.sectionName}` },
        { label: 'Phone', width: 0.15, value: (r) => r.parentPhone || '-' },
        { label: 'Prev. Dues', width: 0.14, align: 'right', value: (r) => inr(r.arrears) },
        { label: 'Total Due', width: 0.18, align: 'right', bold: true, colorFn: () => '#dc2626', value: (r) => inr(r.totalDue) },
      ],
      rows: rows.slice(0, 2000),
    }],
  });
  return sendPdf(res, pdf, 'fee-dues.pdf');
});

const sendReminders = asyncHandler(async (req, res) => {
  const { studentIds } = remindSchema.parse(req.body);
  const { rows } = await buildStudentRows(req, { status: 'overdue', sort: 'due' });
  const wanted = new Set(studentIds);
  const targets = rows.filter((r) => wanted.has(r.studentId) && r.totalDue > 0);

  // Don't spam parents: one reminder per student per 24 hours
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await prisma.notification.findMany({
    where: { schoolId: req.schoolId, type: 'fee_due', recipientRef: { in: targets.map((t) => t.studentId) }, createdAt: { gte: since } },
    select: { recipientRef: true },
  });
  const skip = new Set(recent.map((r) => r.recipientRef));
  const data = targets.filter((t) => !skip.has(t.studentId)).map((t) => ({
    schoolId: req.schoolId, recipientType: 'parent', recipientRef: t.studentId, type: 'fee_due',
    title: 'Fee reminder',
    message: `Fee of Rs. ${inr(t.totalDue)} is pending for ${t.name}. Please pay at the school fee counter.`,
  }));
  await createBulkNotifications(data);

  await logAudit({ req, action: 'SEND_FEE_REMINDERS', resourceType: 'notification', metadata: { sent: data.length } });
  return ApiResponse.success(res, 200, `Reminder sent to ${data.length} parents`, { sent: data.length, skipped: targets.length - data.length });
});

// ───────── receipt exports ─────────
const exportReceiptsCsv = asyncHandler(async (req, res) => {
  const rows = await prisma.feeReceipt.findMany({
    where: buildReceiptWhere(req.schoolId, req.query),
    orderBy: [{ paymentDate: 'asc' }, { receiptSeq: 'asc' }],
    take: 20000,
  });
  return sendCsv(res, rows.map((r) => ({
    'Receipt No': r.receiptNo, Date: toDateStr(r.paymentDate), Student: r.studentName, 'Adm. No': r.enrollmentNumber,
    Class: [r.className, r.sectionName].filter(Boolean).join(' '), Mode: MODE(r.paymentMode), Reference: r.referenceNo || '',
    Fees: num(r.subTotal), 'Late Fee': num(r.lateFeeTotal), Total: num(r.totalAmount),
    'Collected By': r.collectedByName, Status: r.status, Remarks: r.remarks || '',
  })), 'fee-receipts.csv');
});

const collectionPdf = asyncHandler(async (req, res) => {
  const where = buildReceiptWhere(req.schoolId, req.query);
  const [rows, agg, byMode, cancelled] = await Promise.all([
    prisma.feeReceipt.findMany({ where: { ...where, status: 'active' }, orderBy: [{ paymentDate: 'asc' }, { receiptSeq: 'asc' }], take: 1500 }),
    prisma.feeReceipt.aggregate({ where: { ...where, status: 'active' }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.feeReceipt.groupBy({ by: ['paymentMode'], where: { ...where, status: 'active' }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.feeReceipt.count({ where: { ...where, status: 'cancelled' } }),
  ]);

  const pdf = await generateTableReportPDF({
    schoolId: req.schoolId,
    title: 'Fee Collection Report',
    subtitle: `${req.query.from || 'Beginning'}  to  ${req.query.to || req.fee.today}`,
    summaryStats: [
      { label: 'Total Collected', value: inr(num(agg._sum.totalAmount)), tone: 'good' },
      { label: 'Receipts', value: agg._count._all, tone: 'neutral' },
      { label: 'Cancelled', value: cancelled, tone: cancelled ? 'warn' : 'neutral' },
    ],
    sections: [
      {
        heading: 'By payment mode',
        columns: [
          { label: 'Mode', width: 0.5, value: (r) => MODE(r.paymentMode) },
          { label: 'Receipts', width: 0.2, align: 'center', value: (r) => String(r._count._all) },
          { label: 'Amount', width: 0.3, align: 'right', bold: true, value: (r) => inr(num(r._sum.totalAmount)) },
        ],
        rows: byMode,
      },
      {
        heading: 'Receipts',
        note: rows.length >= 1500 ? 'First 1500 shown' : undefined,
        columns: [
          { label: 'Receipt No.', width: 0.22, key: 'receiptNo' },
          { label: 'Date', width: 0.12, align: 'center', value: (r) => toDateStr(r.paymentDate) },
          { label: 'Student', width: 0.24, key: 'studentName' },
          { label: 'Mode', width: 0.12, align: 'center', value: (r) => MODE(r.paymentMode) },
          { label: 'By', width: 0.12, key: 'collectedByName' },
          { label: 'Amount', width: 0.18, align: 'right', bold: true, value: (r) => inr(num(r.totalAmount)) },
        ],
        rows,
      },
    ],
  });
  return sendPdf(res, pdf, 'fee-collection-report.pdf');
});

module.exports = { getDashboard, exportDuesCsv, duesPdf, sendReminders, exportReceiptsCsv, collectionPdf };