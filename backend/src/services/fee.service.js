const { prisma } = require('../config/db');

const STEP_MONTHS = { one_time: 0, monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ───────── money + status helpers ─────────
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const balanceOf = (c) => r2(num(c.amount) - num(c.discount) - num(c.paidAmount));

function deriveStatus(amount, discount, paid) {
  const net = r2(num(amount) - num(discount));
  const p = num(paid);
  if (net - p <= 0.004) return 'paid';
  return p > 0 ? 'partial' : 'pending';
}

// ───────── date helpers (date-only, timezone safe) ─────────
function todayInTz(tz = 'Asia/Kolkata') {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
const toDateOnly = (str) => new Date(`${str}T00:00:00.000Z`);
const safeDate = (str) => (typeof str === 'string' && DATE_RE.test(str) ? toDateOnly(str) : undefined);
const toDateStr = (d) => new Date(d).toISOString().slice(0, 10);

function diffDays(laterStr, earlierStr) {
  return Math.round((Date.parse(`${laterStr}T00:00:00Z`) - Date.parse(`${earlierStr}T00:00:00Z`)) / 86400000);
}

function addMonths(date, n) {
  const d = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target;
}

function shortSessionTag(label = '') {
  const m = /(\d{4})\D+(\d{2,4})/.exec(label);
  return m ? `${m[1]}-${m[2].slice(-2)}` : label.replace(/[^A-Za-z0-9]/g, '') || 'NA';
}

// ───────── settings + late fee ─────────
function normalizeSettings(s) {
  return {
    ...s,
    lateFeeAmount: num(s.lateFeeAmount),
    lateFeeMaxAmount: s.lateFeeMaxAmount == null ? null : num(s.lateFeeMaxAmount),
    enabledModes: Array.isArray(s.enabledModes) ? s.enabledModes : [],
    headerFields: Array.isArray(s.headerFields) ? s.headerFields : [],
  };
}

// Late fee still payable on a charge as of `onDateStr`. Never stored: always derived, so changing
// the late-fee rule or waiving takes effect immediately.
function computeLateFee(charge, settings, onDateStr) {
  if (!settings || settings.lateFeeMode === 'none' || settings.lateFeeAmount <= 0 || charge.lateFeeWaived) return 0;
  if (balanceOf(charge) <= 0) return 0;
  const daysLate = diffDays(onDateStr, toDateStr(charge.dueDate)) - (settings.lateFeeGraceDays || 0);
  if (daysLate <= 0) return 0;
  let fee = settings.lateFeeMode === 'per_day' ? settings.lateFeeAmount * daysLate : settings.lateFeeAmount;
  if (settings.lateFeeMaxAmount) fee = Math.min(fee, settings.lateFeeMaxAmount);
  return Math.max(0, r2(fee - num(charge.lateFeePaid)));
}

// ───────── fee structure -> student charges ─────────
function installmentDates(item) {
  const step = STEP_MONTHS[item.frequency] ?? 1;
  const count = item.frequency === 'one_time' ? 1 : item.installments;
  return Array.from({ length: count }, (_, i) => addMonths(item.firstDueDate, i * step));
}

function chargeTitle(item, headName, index, due) {
  if (item.frequency === 'one_time' || item.installments === 1) return headName;
  if (item.frequency === 'monthly') return `${headName} - ${MONTHS[due.getUTCMonth()]} ${due.getUTCFullYear()}`;
  return `${headName} - Installment ${index + 1}/${item.installments}`;
}

// Idempotent: creates only the charges that are missing. Safe to call any time.
async function syncCharges({ schoolId, sessionId, classId, enrollmentIds }) {
  const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } });
  if (!session) return { created: 0, enrollments: 0 };

  const items = await prisma.feeStructureItem.findMany({
    where: { schoolId, sessionId, ...(classId ? { classId } : {}), feeHead: { isActive: true } },
    include: { feeHead: { select: { name: true } } },
  });
  if (!items.length) return { created: 0, enrollments: 0 };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      status: 'active',
      student: { schoolId, status: 'active' },
      ...(classId ? { classId } : {}),
      ...(enrollmentIds ? { id: { in: enrollmentIds } } : {}),
    },
    select: { id: true, classId: true, studentId: true },
  });
  if (!enrollments.length) return { created: 0, enrollments: 0 };

  // "new" vs "old" student = enrolled in any earlier session?
  const earlier = await prisma.enrollment.findMany({
    where: { studentId: { in: enrollments.map((e) => e.studentId) }, session: { startDate: { lt: session.startDate } } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const returning = new Set(earlier.map((e) => e.studentId));

  const existing = await prisma.studentFeeCharge.findMany({
    where: {
      schoolId,
      structureItemId: { not: null },
      enrollment: { sessionId, ...(classId ? { classId } : {}) },
      ...(enrollmentIds ? { enrollmentId: { in: enrollmentIds } } : {}),
    },
    select: { enrollmentId: true, structureItemId: true, installmentNo: true },
  });
  const have = new Set(existing.map((c) => `${c.enrollmentId}|${c.structureItemId}|${c.installmentNo}`));

  const itemsByClass = {};
  items.forEach((it) => { (itemsByClass[it.classId] = itemsByClass[it.classId] || []).push(it); });

  const rows = [];
  for (const en of enrollments) {
    for (const it of itemsByClass[en.classId] || []) {
      if (it.appliesTo === 'new' && returning.has(en.studentId)) continue;
      if (it.appliesTo === 'old' && !returning.has(en.studentId)) continue;
      installmentDates(it).forEach((due, i) => {
        if (have.has(`${en.id}|${it.id}|${i + 1}`)) return;
        rows.push({
          schoolId,
          enrollmentId: en.id,
          feeHeadId: it.feeHeadId,
          structureItemId: it.id,
          installmentNo: i + 1,
          title: chargeTitle(it, it.feeHead.name, i, due),
          dueDate: due,
          amount: it.amount,
        });
      });
    }
  }

  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.studentFeeCharge.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
  }
  return { created: rows.length, enrollments: enrollments.length };
}

// ───────── receipts ─────────
async function nextReceiptNo(tx, { schoolId, sessionId, sessionLabel, prefix }) {
  const counter = await tx.feeReceiptCounter.upsert({
    where: { schoolId_sessionId: { schoolId, sessionId } },
    create: { schoolId, sessionId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  const seq = counter.lastNumber;
  return { receiptSeq: seq, receiptNo: `${prefix}/${shortSessionTag(sessionLabel)}/${String(seq).padStart(5, '0')}` };
}

function buildReceiptWhere(schoolId, q = {}) {
  const where = { schoolId };
  const from = safeDate(q.from);
  const to = safeDate(q.to);
  if (from || to) where.paymentDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (q.mode) where.paymentMode = q.mode;
  if (q.collectorId) where.collectedById = q.collectorId;
  if (q.classId) where.classId = q.classId;
  if (q.studentId) where.studentId = q.studentId;
  if (q.status === 'active' || q.status === 'cancelled') where.status = q.status;
  if (q.search) {
    const s = String(q.search).trim();
    where.OR = [
      { receiptNo: { contains: s, mode: 'insensitive' } },
      { studentName: { contains: s, mode: 'insensitive' } },
      { enrollmentNumber: { contains: s, mode: 'insensitive' } },
    ];
  }
  return where;
}

function serializeReceipt(r) {
  return {
    id: r.id,
    receiptNo: r.receiptNo,
    sessionId: r.sessionId,
    sessionLabel: r.sessionLabel,
    studentId: r.studentId,
    studentName: r.studentName,
    enrollmentNumber: r.enrollmentNumber,
    className: r.className,
    sectionName: r.sectionName,
    rollNumber: r.rollNumber,
    parentName: r.parentName,
    parentPhone: r.parentPhone,
    paymentDate: toDateStr(r.paymentDate),
    paymentMode: r.paymentMode,
    referenceNo: r.referenceNo,
    bankName: r.bankName,
    instrumentDate: r.instrumentDate ? toDateStr(r.instrumentDate) : null,
    subTotal: num(r.subTotal),
    lateFeeTotal: num(r.lateFeeTotal),
    totalAmount: num(r.totalAmount),
    taxIncluded: num(r.taxIncluded),
    balanceAfter: num(r.balanceAfter),
    remarks: r.remarks,
    status: r.status,
    cancelReason: r.cancelReason,
    cancelledAt: r.cancelledAt,
    collectedById: r.collectedById,
    collectedByName: r.collectedByName,
    createdAt: r.createdAt,
    ...(r.items
      ? { items: r.items.map((i) => ({ id: i.id, headName: i.headName, title: i.title, amount: num(i.amount), lateFee: num(i.lateFee) })) }
      : {}),
  };
}

function serializeCharge(c, settings, todayStr) {
  const bal = balanceOf(c);
  const due = toDateStr(c.dueDate);
  return {
    id: c.id,
    title: c.title,
    headName: c.feeHead ? c.feeHead.name : null,
    feeHeadId: c.feeHeadId,
    sessionId: c.enrollment ? c.enrollment.sessionId : null,
    sessionLabel: c.enrollment && c.enrollment.session ? c.enrollment.session.label : null,
    dueDate: due,
    amount: num(c.amount),
    discount: num(c.discount),
    discountReason: c.discountReason,
    paid: num(c.paidAmount),
    balance: bal,
    lateFee: computeLateFee(c, settings, todayStr),
    lateFeeWaived: c.lateFeeWaived,
    status: c.status,
    isOverdue: bal > 0 && due < todayStr,
    isManual: !c.structureItemId,
  };
}

async function getActiveSession(schoolId) {
  return prisma.academicSession.findFirst({ where: { schoolId, isActive: true } });
}

module.exports = {
  STEP_MONTHS, num, r2, balanceOf, deriveStatus,
  todayInTz, toDateOnly, safeDate, toDateStr, diffDays, addMonths, shortSessionTag,
  normalizeSettings, computeLateFee, installmentDates, chargeTitle, syncCharges,
  nextReceiptNo, buildReceiptWhere, serializeReceipt, serializeCharge, getActiveSession,
};