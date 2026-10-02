const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const logger = require('../../utils/logger');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createNotification } = require('../../services/notification.service');
const { generateFeeReceiptPDF } = require('../../services/feeReceiptPdf.service');
const { generateTableReportPDF } = require('../../services/pdf.service');
const { collectSchema, cancelReceiptSchema, addChargeSchema, concessionSchema } = require('../../validators/fee.validator');
const {
  num, r2, balanceOf, deriveStatus, toDateOnly, toDateStr, computeLateFee, syncCharges, nextReceiptNo,
  buildReceiptWhere, serializeReceipt, serializeCharge, getActiveSession,
} = require('../../services/fee.service');

const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ───────── student roster with fee status (dashboard, dues, exports all use this) ─────────
async function buildStudentRows(req, overrides = {}) {
  const query = { ...req.query, ...overrides };
  const { classId, sectionId, status = 'all', sort } = query;
  const q = query.search ? String(query.search).trim() : '';
  const { schoolId } = req;

  const session = query.sessionId
    ? await prisma.academicSession.findFirst({ where: { id: query.sessionId, schoolId } })
    : await getActiveSession(schoolId);
  if (!session) return { rows: [], counts: {}, summary: { due: 0 }, session: null };

  const sessionId = session.id;
  const todayDate = toDateOnly(req.fee.today);
  const enrollFilter = { sessionId, ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      ...enrollFilter,
      status: 'active',
      student: {
        schoolId,
        status: 'active',
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { enrollmentNumber: { contains: q, mode: 'insensitive' } },
            { parentName: { contains: q, mode: 'insensitive' } },
            { parentPhone: { contains: q } },
          ],
        } : {}),
      },
    },
    select: {
      id: true,
      rollNumber: true,
      class: { select: { name: true, sortOrder: true } },
      section: { select: { name: true } },
      student: { select: { id: true, name: true, enrollmentNumber: true, parentName: true, parentPhone: true } },
    },
  });

  const chargeScope = q ? { enrollmentId: { in: enrollments.map((e) => e.id) } } : { enrollment: enrollFilter };
  const studentScope = q
    ? { studentId: { in: enrollments.map((e) => e.student.id) } }
    : { student: { enrollments: { some: enrollFilter } } };
  const sums = { amount: true, discount: true, paidAmount: true };

  const [totals, dues, arrearRows] = await Promise.all([
    prisma.studentFeeCharge.groupBy({ by: ['enrollmentId'], where: { schoolId, ...chargeScope }, _sum: sums }),
    prisma.studentFeeCharge.groupBy({
      by: ['enrollmentId'],
      where: { schoolId, ...chargeScope, status: { not: 'paid' }, dueDate: { lte: todayDate } },
      _sum: sums,
    }),
    prisma.studentFeeCharge.findMany({
      where: {
        schoolId, status: { not: 'paid' }, dueDate: { lte: todayDate },
        enrollment: { sessionId: { not: sessionId }, ...studentScope },
      },
      select: { amount: true, discount: true, paidAmount: true, enrollment: { select: { studentId: true } } },
    }),
  ]);

  const totalBy = Object.fromEntries(totals.map((t) => [t.enrollmentId, t._sum]));
  const dueBy = Object.fromEntries(dues.map((t) => [t.enrollmentId, t._sum]));
  const arrearBy = {};
  arrearRows.forEach((c) => {
    const k = c.enrollment.studentId;
    arrearBy[k] = r2((arrearBy[k] || 0) + balanceOf(c));
  });

  let rows = enrollments.map((e) => {
    const t = totalBy[e.id];
    const d = dueBy[e.id];
    const net = t ? r2(num(t.amount) - num(t.discount)) : 0;
    const paid = t ? num(t.paidAmount) : 0;
    const dueNow = d ? r2(num(d.amount) - num(d.discount) - num(d.paidAmount)) : 0;
    const arrears = arrearBy[e.student.id] || 0;
    const outstanding = r2(net - paid);
    let feeStatus = 'upcoming';
    if (!t && arrears === 0) feeStatus = 'no_fees';
    else if (dueNow + arrears > 0.004) feeStatus = 'overdue';
    else if (outstanding <= 0.004) feeStatus = 'paid';
    return {
      studentId: e.student.id, enrollmentId: e.id, name: e.student.name, enrollmentNumber: e.student.enrollmentNumber,
      rollNumber: e.rollNumber, className: e.class.name, sectionName: e.section.name, classOrder: e.class.sortOrder,
      parentName: e.student.parentName, parentPhone: e.student.parentPhone,
      net, paid, dueNow, arrears, totalDue: r2(dueNow + arrears), outstanding, status: feeStatus,
    };
  });

  const counts = { all: rows.length, overdue: 0, paid: 0, upcoming: 0, no_fees: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });
  const summary = { due: r2(rows.reduce((s, r) => s + r.totalDue, 0)) };

  if (['overdue', 'paid', 'upcoming', 'no_fees'].includes(status)) rows = rows.filter((r) => r.status === status);

  const rollNum = (r) => (r.rollNumber !== null && r.rollNumber !== '' && !Number.isNaN(Number(r.rollNumber)) ? Number(r.rollNumber) : Infinity);
  rows.sort(sort === 'due'
    ? (a, b) => b.totalDue - a.totalDue
    : (a, b) => a.classOrder - b.classOrder || a.sectionName.localeCompare(b.sectionName) || rollNum(a) - rollNum(b) || a.name.localeCompare(b.name));

  return { rows, counts, summary, session };
}

const listStudents = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const { rows, counts, summary } = await buildStudentRows(req);
  const total = rows.length;
  const students = rows.slice((page - 1) * limit, page * limit);
  return ApiResponse.success(res, 200, 'Students fetched', { students, total, page, totalPages: Math.ceil(total / limit), counts, summary });
});

// ───────── student ledger ─────────
const getLedger = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const { settings, today } = req.fee;

  const student = await prisma.student.findFirst({
    where: { id: req.params.studentId, schoolId },
    include: { enrollments: { include: { class: true, section: true, session: true }, orderBy: { session: { startDate: 'desc' } } } },
  });
  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  // Lazy sync: whatever the structure says should exist for this student, exists, before we show it.
  const bySession = {};
  student.enrollments.filter((e) => e.status === 'active').forEach((e) => { (bySession[e.sessionId] = bySession[e.sessionId] || []).push(e.id); });
  for (const [sessionId, enrollmentIds] of Object.entries(bySession)) {
    try { await syncCharges({ schoolId, sessionId, enrollmentIds }); } catch (err) { logger.warn(`Fee sync failed: ${err.message}`); }
  }

  const [rawCharges, receipts] = await Promise.all([
    prisma.studentFeeCharge.findMany({
      where: { schoolId, enrollment: { studentId: student.id } },
      include: { feeHead: { select: { name: true } }, enrollment: { select: { sessionId: true, session: { select: { label: true, startDate: true } } } } },
    }),
    prisma.feeReceipt.findMany({ where: { schoolId, studentId: student.id }, orderBy: { createdAt: 'desc' }, take: 15 }),
  ]);

  rawCharges.sort((a, b) => a.enrollment.session.startDate - b.enrollment.session.startDate || a.dueDate - b.dueDate || a.title.localeCompare(b.title));
  const charges = rawCharges.map((c) => serializeCharge(c, settings, today));

  const current = student.enrollments[0] || null;
  const open = charges.filter((c) => c.balance > 0);
  const totals = {
    dueNow: r2(open.filter((c) => c.dueDate <= today).reduce((s, c) => s + c.balance, 0)),
    lateFee: r2(open.reduce((s, c) => s + c.lateFee, 0)),
    upcoming: r2(open.filter((c) => c.dueDate > today).reduce((s, c) => s + c.balance, 0)),
    previousDue: r2(open.filter((c) => current && c.sessionId !== current.sessionId && c.dueDate <= today).reduce((s, c) => s + c.balance, 0)),
    paid: r2(charges.reduce((s, c) => s + c.paid, 0)),
    outstanding: r2(open.reduce((s, c) => s + c.balance, 0)),
  };

  return ApiResponse.success(res, 200, 'Ledger fetched', {
    student: {
      id: student.id, name: student.name, enrollmentNumber: student.enrollmentNumber, parentName: student.parentName,
      parentPhone: student.parentPhone, parentEmail: student.parentEmail, photoUrl: student.photoUrl, status: student.status,
    },
    enrollment: current && {
      id: current.id, sessionId: current.sessionId, sessionLabel: current.session.label,
      className: current.class.name, sectionName: current.section.name, rollNumber: current.rollNumber,
    },
    enrollments: student.enrollments.map((e) => ({ id: e.id, sessionId: e.sessionId, sessionLabel: e.session.label, className: e.class.name, status: e.status })),
    charges,
    totals,
    receipts: receipts.map(serializeReceipt),
  });
});

// ───────── collect fees -> receipt ─────────
const collectFees = asyncHandler(async (req, res) => {
  const data = collectSchema.parse(req.body);
  const { settings, today } = req.fee;
  const { schoolId } = req;
  const isAdmin = req.user.role === 'admin';

  if (!settings.enabledModes.includes(data.paymentMode)) throw httpError(422, 'This payment mode is not enabled for your school');

  let paymentDateStr = today;
  if (data.paymentDate && data.paymentDate !== today) {
    if (!isAdmin) throw httpError(403, 'Only the school admin can back-date a receipt');
    if (data.paymentDate > today) throw httpError(422, 'Payment date cannot be in the future');
    paymentDateStr = data.paymentDate;
  }
  if (new Set(data.items.map((i) => i.chargeId)).size !== data.items.length) throw httpError(422, 'Duplicate fee items in request');

  const student = await prisma.student.findFirst({
    where: { id: data.studentId, schoolId },
    include: { enrollments: { include: { class: true, section: true, session: true }, orderBy: { session: { startDate: 'desc' } } } },
  });
  if (!student) throw httpError(404, 'Student not found');
  const ref = student.enrollments[0];
  if (!ref) throw httpError(422, 'Student has no enrollment');

  const activeSession = await getActiveSession(schoolId);
  const receiptSession = activeSession || ref.session;

  const receipt = await prisma.$transaction(async (tx) => {
    const ids = data.items.map((i) => i.chargeId);
    const charges = await tx.studentFeeCharge.findMany({
      where: { id: { in: ids }, schoolId, enrollment: { studentId: student.id } },
      include: { feeHead: { select: { name: true, gstRate: true } } },
    });
    if (charges.length !== ids.length) throw httpError(404, 'One or more fee items were not found for this student');
    const byId = new Map(charges.map((c) => [c.id, c]));
    const canWaive = isAdmin || settings.collectorCanConcede;

    let subTotal = 0;
    let lateTotal = 0;
    let taxIncluded = 0;
    const items = [];
    const updates = [];

    data.items.forEach((it, idx) => {
      const c = byId.get(it.chargeId);
      const bal = balanceOf(c);
      if (bal <= 0) throw httpError(409, `"${c.title}" is already fully paid`);
      const amount = r2(it.amount);
      if (amount > bal + 0.001) throw httpError(422, `Amount for "${c.title}" is more than its balance (Rs. ${bal})`);
      if (it.waiveLateFee && !canWaive) throw httpError(403, 'You do not have permission to waive late fees');

      const lateFee = it.waiveLateFee ? 0 : computeLateFee(c, settings, paymentDateStr);
      const rate = num(c.feeHead.gstRate);
      subTotal += amount;
      lateTotal += lateFee;
      if (settings.gstEnabled && rate > 0) taxIncluded += (amount * rate) / (100 + rate);

      items.push({ chargeId: c.id, feeHeadId: c.feeHeadId, headName: c.feeHead.name, title: c.title, amount, lateFee, gstRate: rate, position: idx });
      updates.push({ c, amount, lateFee, waive: !!it.waiveLateFee });
    });

    const total = r2(subTotal + lateTotal);
    if (total <= 0) throw httpError(422, 'Nothing to collect');

    // Optimistic lock: if two counters pay the same fee at once, the second one fails cleanly instead of double-paying.
    for (const u of updates) {
      const newPaid = r2(num(u.c.paidAmount) + u.amount);
      const swapped = await tx.studentFeeCharge.updateMany({
        where: { id: u.c.id, paidAmount: u.c.paidAmount, lateFeePaid: u.c.lateFeePaid },
        data: {
          paidAmount: newPaid,
          lateFeePaid: r2(num(u.c.lateFeePaid) + u.lateFee),
          status: deriveStatus(u.c.amount, u.c.discount, newPaid),
          ...(u.waive ? { lateFeeWaived: true } : {}),
        },
      });
      if (swapped.count !== 1) throw httpError(409, 'These fees were just updated by someone else. Please reload and try again.');
    }

    const stillDue = await tx.studentFeeCharge.findMany({
      where: { schoolId, enrollment: { studentId: student.id }, status: { not: 'paid' }, dueDate: { lte: toDateOnly(paymentDateStr) } },
      select: { amount: true, discount: true, paidAmount: true },
    });
    const balanceAfter = r2(stillDue.reduce((s, c) => s + balanceOf(c), 0));

    const { receiptNo, receiptSeq } = await nextReceiptNo(tx, {
      schoolId, sessionId: receiptSession.id, sessionLabel: receiptSession.label, prefix: settings.receiptPrefix,
    });

    return tx.feeReceipt.create({
      data: {
        schoolId, sessionId: receiptSession.id, receiptNo, receiptSeq,
        studentId: student.id, enrollmentId: ref.id, classId: ref.classId,
        studentName: student.name, enrollmentNumber: student.enrollmentNumber,
        className: ref.class.name, sectionName: ref.section.name, rollNumber: ref.rollNumber,
        parentName: student.parentName, parentPhone: student.parentPhone, sessionLabel: receiptSession.label,
        paymentDate: toDateOnly(paymentDateStr), paymentMode: data.paymentMode,
        referenceNo: data.referenceNo || null, bankName: data.bankName || null,
        instrumentDate: data.instrumentDate ? toDateOnly(data.instrumentDate) : null,
        subTotal: r2(subTotal), lateFeeTotal: r2(lateTotal), totalAmount: total, taxIncluded: r2(taxIncluded), balanceAfter,
        remarks: data.remarks || null,
        snapshot: {
          name: settings.displayName || req.fee.school.name, tagline: settings.tagline,
          address: settings.address || req.fee.school.address, phone: settings.phone || req.fee.school.contactPhone,
          email: settings.email || req.fee.school.contactEmail, website: settings.website,
          gstEnabled: settings.gstEnabled, gstin: settings.gstin, pan: settings.panNumber,
          headerFields: settings.headerFields, signatureLabel: settings.signatureLabel,
        },
        collectedById: req.user.id, collectedByName: req.user.name,
        items: { create: items },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }, { timeout: 20000 });

  await logAudit({
    req, action: 'COLLECT_FEE', resourceType: 'fee_receipt', resourceId: receipt.id,
    metadata: { receiptNo: receipt.receiptNo, total: num(receipt.totalAmount), mode: receipt.paymentMode, studentId: student.id },
  });
  createNotification({
    schoolId, recipientType: 'parent', recipientRef: student.id, type: 'fee_receipt',
    title: 'Fee payment received',
    message: `Rs. ${inr(num(receipt.totalAmount))} received for ${student.name}. Receipt no. ${receipt.receiptNo}.`,
  }).catch((err) => logger.warn(`Fee notification failed: ${err.message}`));

  return ApiResponse.success(res, 201, 'Fee collected', serializeReceipt(receipt));
});

// ───────── receipts ─────────
const listReceipts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const where = buildReceiptWhere(req.schoolId, req.query);
  const activeWhere = { ...where, status: 'active' };

  const [rows, total, agg, byMode, cancelled] = await Promise.all([
    prisma.feeReceipt.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.feeReceipt.count({ where }),
    prisma.feeReceipt.aggregate({ where: activeWhere, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.feeReceipt.groupBy({ by: ['paymentMode'], where: activeWhere, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.feeReceipt.count({ where: { ...where, status: 'cancelled' } }),
  ]);

  return ApiResponse.success(res, 200, 'Receipts fetched', {
    receipts: rows.map(serializeReceipt),
    total, page, totalPages: Math.ceil(total / limit),
    summary: {
      collected: num(agg._sum.totalAmount), count: agg._count._all, cancelled,
      byMode: byMode.map((m) => ({ mode: m.paymentMode, total: num(m._sum.totalAmount), count: m._count._all })),
    },
  });
});

const loadReceipt = (req) =>
  prisma.feeReceipt.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { items: { orderBy: { position: 'asc' } } } });

const getReceipt = asyncHandler(async (req, res) => {
  const receipt = await loadReceipt(req);
  if (!receipt) return ApiResponse.error(res, 404, 'Receipt not found');
  return ApiResponse.success(res, 200, 'Receipt fetched', serializeReceipt(receipt));
});

const receiptPdf = asyncHandler(async (req, res) => {
  const receipt = await loadReceipt(req);
  if (!receipt) return ApiResponse.error(res, 404, 'Receipt not found');

  const { settings, school } = req.fee;
  const copies = Math.min(2, Math.max(1, Number(req.query.copies) || settings.copiesPerReceipt || 2));
  const pdf = await generateFeeReceiptPDF({ receipt: { ...serializeReceipt(receipt), snapshot: receipt.snapshot }, settings, school, copies });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${receipt.receiptNo.replace(/[^A-Za-z0-9-]/g, '-')}.pdf"`);
  res.setHeader('Content-Length', pdf.length);
  return res.end(pdf);
});

// Admin only. Reverses the payment on every ledger line, keeps the receipt (marked cancelled) for audit.
const cancelReceipt = asyncHandler(async (req, res) => {
  const { reason } = cancelReceiptSchema.parse(req.body);

  const result = await prisma.$transaction(async (tx) => {
    const receipt = await tx.feeReceipt.findFirst({ where: { id: req.params.id, schoolId: req.schoolId }, include: { items: true } });
    if (!receipt) throw httpError(404, 'Receipt not found');
    if (receipt.status === 'cancelled') throw httpError(409, 'This receipt is already cancelled');

    for (const item of receipt.items) {
      if (!item.chargeId) continue;
      const c = await tx.studentFeeCharge.findUnique({ where: { id: item.chargeId } });
      if (!c) continue;
      const paid = Math.max(0, r2(num(c.paidAmount) - num(item.amount)));
      await tx.studentFeeCharge.update({
        where: { id: c.id },
        data: {
          paidAmount: paid,
          lateFeePaid: Math.max(0, r2(num(c.lateFeePaid) - num(item.lateFee))),
          status: deriveStatus(c.amount, c.discount, paid),
        },
      });
    }
    return tx.feeReceipt.update({
      where: { id: receipt.id },
      data: { status: 'cancelled', cancelledAt: new Date(), cancelledById: req.user.id, cancelReason: reason },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }, { timeout: 20000 });

  await logAudit({ req, action: 'CANCEL_FEE_RECEIPT', resourceType: 'fee_receipt', resourceId: result.id, metadata: { receiptNo: result.receiptNo, reason } });
  return ApiResponse.success(res, 200, 'Receipt cancelled and the dues restored', serializeReceipt(result));
});

// ───────── ledger edits ─────────
const addCharge = asyncHandler(async (req, res) => {
  const data = addChargeSchema.parse(req.body);
  const [enrollment, head] = await Promise.all([
    prisma.enrollment.findFirst({ where: { id: data.enrollmentId, studentId: data.studentId, student: { schoolId: req.schoolId } } }),
    prisma.feeHead.findFirst({ where: { id: data.feeHeadId, schoolId: req.schoolId } }),
  ]);
  if (!enrollment) return ApiResponse.error(res, 404, 'Student enrollment not found');
  if (!head) return ApiResponse.error(res, 404, 'Fee head not found');

  const charge = await prisma.studentFeeCharge.create({
    data: {
      schoolId: req.schoolId, enrollmentId: enrollment.id, feeHeadId: head.id,
      title: data.title || head.name, dueDate: toDateOnly(data.dueDate), amount: data.amount,
    },
  });
  await logAudit({ req, action: 'ADD_FEE_CHARGE', resourceType: 'fee_charge', resourceId: charge.id, metadata: { amount: data.amount, studentId: data.studentId } });
  return ApiResponse.success(res, 201, 'Charge added to the student ledger', { id: charge.id });
});

// Sets (replaces) the concession on the selected charges. value 0 removes it.
const applyConcession = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && !req.fee.settings.collectorCanConcede) {
    return ApiResponse.error(res, 403, 'You do not have permission to give concessions');
  }
  const data = concessionSchema.parse(req.body);

  const charges = await prisma.studentFeeCharge.findMany({ where: { id: { in: data.chargeIds }, schoolId: req.schoolId } });
  if (charges.length !== data.chargeIds.length) return ApiResponse.error(res, 404, 'One or more fee items were not found');

  await prisma.$transaction(charges.map((c) => {
    const gross = num(c.amount);
    const wanted = data.type === 'percent' ? (gross * data.value) / 100 : data.value;
    const discount = Math.max(0, Math.min(r2(wanted), r2(gross - num(c.paidAmount))));
    return prisma.studentFeeCharge.update({
      where: { id: c.id },
      data: { discount, discountReason: discount > 0 ? data.reason : null, status: deriveStatus(c.amount, discount, c.paidAmount) },
    });
  }));

  await logAudit({ req, action: 'APPLY_FEE_CONCESSION', resourceType: 'fee_charge', metadata: { chargeIds: data.chargeIds, type: data.type, value: data.value, reason: data.reason || null } });
  return ApiResponse.success(res, 200, 'Concession applied');
});

const deleteCharge = asyncHandler(async (req, res) => {
  const charge = await prisma.studentFeeCharge.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!charge) return ApiResponse.error(res, 404, 'Charge not found');
  if (num(charge.paidAmount) > 0) return ApiResponse.error(res, 409, 'Payments exist against this charge. Cancel the receipt first.');

  await prisma.studentFeeCharge.delete({ where: { id: charge.id } });
  await logAudit({ req, action: 'DELETE_FEE_CHARGE', resourceType: 'fee_charge', resourceId: charge.id, metadata: { title: charge.title } });
  return ApiResponse.success(res, 200, 'Charge removed');
});

// ───────── student fee statement PDF ─────────
const statementPdf = asyncHandler(async (req, res) => {
  const { settings, today } = req.fee;
  const student = await prisma.student.findFirst({
    where: { id: req.params.studentId, schoolId: req.schoolId },
    include: { enrollments: { include: { class: true, section: true, session: true }, orderBy: { session: { startDate: 'desc' } } } },
  });
  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  const sessionId = req.query.sessionId || (student.enrollments[0] && student.enrollments[0].sessionId);
  const en = student.enrollments.find((e) => e.sessionId === sessionId) || student.enrollments[0];

  const [raw, receipts] = await Promise.all([
    prisma.studentFeeCharge.findMany({
      where: { schoolId: req.schoolId, enrollment: { studentId: student.id, sessionId } },
      include: { feeHead: { select: { name: true } } },
      orderBy: [{ dueDate: 'asc' }],
    }),
    prisma.feeReceipt.findMany({ where: { schoolId: req.schoolId, studentId: student.id, status: 'active' }, orderBy: { paymentDate: 'asc' } }),
  ]);
  const charges = raw.map((c) => serializeCharge(c, settings, today));
  const billed = r2(charges.reduce((s, c) => s + c.amount - c.discount, 0));
  const paid = r2(charges.reduce((s, c) => s + c.paid, 0));
  const tone = { paid: 'good', partial: 'warn', pending: 'bad' };

  const pdf = await generateTableReportPDF({
    schoolId: req.schoolId,
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

module.exports = {
  buildStudentRows, listStudents, getLedger, collectFees, listReceipts, getReceipt, receiptPdf, cancelReceipt,
  addCharge, applyConcession, deleteCharge, statementPdf,
};