const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const {
  createHeadSchema, updateHeadSchema, createStructureSchema, updateStructureSchema, copyStructureSchema, generateSchema,
} = require('../../validators/fee.validator');
const { num, toDateOnly, toDateStr, addMonths, syncCharges, getActiveSession } = require('../../services/fee.service');

// ───────── fee heads ─────────
const serializeHead = (h) => ({
  id: h.id, name: h.name, code: h.code, description: h.description, gstRate: num(h.gstRate),
  sortOrder: h.sortOrder, isActive: h.isActive,
  inUse: h._count ? h._count.structureItems + h._count.charges > 0 : false,
});

const getHeads = asyncHandler(async (req, res) => {
  const heads = await prisma.feeHead.findMany({
    where: { schoolId: req.schoolId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { structureItems: true, charges: true } } },
  });
  return ApiResponse.success(res, 200, 'Fee heads fetched', heads.map(serializeHead));
});

const createHead = asyncHandler(async (req, res) => {
  const data = createHeadSchema.parse(req.body);
  const head = await prisma.feeHead.create({ data: { ...data, schoolId: req.schoolId } });
  await logAudit({ req, action: 'CREATE_FEE_HEAD', resourceType: 'fee_head', resourceId: head.id });
  return ApiResponse.success(res, 201, 'Fee head created', serializeHead(head));
});

const updateHead = asyncHandler(async (req, res) => {
  const data = updateHeadSchema.parse(req.body);
  const head = await prisma.feeHead.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!head) return ApiResponse.error(res, 404, 'Fee head not found');

  const updated = await prisma.feeHead.update({ where: { id: head.id }, data });
  await logAudit({ req, action: 'UPDATE_FEE_HEAD', resourceType: 'fee_head', resourceId: head.id, metadata: data });
  return ApiResponse.success(res, 200, 'Fee head updated', serializeHead(updated));
});

const deleteHead = asyncHandler(async (req, res) => {
  const head = await prisma.feeHead.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
    include: { _count: { select: { structureItems: true, charges: true } } },
  });
  if (!head) return ApiResponse.error(res, 404, 'Fee head not found');
  if (head._count.structureItems + head._count.charges > 0) {
    return ApiResponse.error(res, 409, 'This fee head is already used in a fee structure or student ledgers. Deactivate it instead.');
  }
  await prisma.feeHead.delete({ where: { id: head.id } });
  await logAudit({ req, action: 'DELETE_FEE_HEAD', resourceType: 'fee_head', resourceId: head.id });
  return ApiResponse.success(res, 200, 'Fee head deleted');
});

// ───────── fee structure ─────────
const serializeItem = (i, chargeCount = 0) => ({
  id: i.id, sessionId: i.sessionId, classId: i.classId, className: i.class ? i.class.name : null,
  feeHeadId: i.feeHeadId, headName: i.feeHead ? i.feeHead.name : null,
  amount: num(i.amount), frequency: i.frequency, installments: i.installments,
  firstDueDate: toDateStr(i.firstDueDate), appliesTo: i.appliesTo,
  yearlyTotal: num(i.amount) * (i.frequency === 'one_time' ? 1 : i.installments),
  chargeCount,
});

const getStructure = asyncHandler(async (req, res) => {
  const { sessionId, classId } = req.query;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const items = await prisma.feeStructureItem.findMany({
    where: { schoolId: req.schoolId, sessionId, ...(classId ? { classId } : {}) },
    include: { class: { select: { name: true, sortOrder: true } }, feeHead: { select: { name: true, sortOrder: true } } },
    orderBy: [{ createdAt: 'asc' }],
  });

  const counts = await prisma.studentFeeCharge.groupBy({
    by: ['structureItemId'],
    where: { schoolId: req.schoolId, structureItemId: { in: items.map((i) => i.id) } },
    _count: { _all: true },
  });
  const countById = Object.fromEntries(counts.map((c) => [c.structureItemId, c._count._all]));

  items.sort((a, b) => a.class.sortOrder - b.class.sortOrder || a.feeHead.sortOrder - b.feeHead.sortOrder);
  return ApiResponse.success(res, 200, 'Fee structure fetched', items.map((i) => serializeItem(i, countById[i.id] || 0)));
});

const createStructureItem = asyncHandler(async (req, res) => {
  const data = createStructureSchema.parse(req.body);

  const [cls, head] = await Promise.all([
    prisma.class.findFirst({ where: { id: data.classId, schoolId: req.schoolId, sessionId: data.sessionId } }),
    prisma.feeHead.findFirst({ where: { id: data.feeHeadId, schoolId: req.schoolId } }),
  ]);
  if (!cls) return ApiResponse.error(res, 404, 'Class not found in this session');
  if (!head) return ApiResponse.error(res, 404, 'Fee head not found');

  const item = await prisma.feeStructureItem.create({
    data: {
      schoolId: req.schoolId,
      sessionId: data.sessionId,
      classId: data.classId,
      feeHeadId: data.feeHeadId,
      amount: data.amount,
      frequency: data.frequency,
      installments: data.frequency === 'one_time' ? 1 : data.installments || 1,
      firstDueDate: toDateOnly(data.firstDueDate),
      appliesTo: data.appliesTo || 'all',
    },
    include: { class: { select: { name: true } }, feeHead: { select: { name: true } } },
  });

  // Create every student's dues straight away
  const synced = await syncCharges({ schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId });

  await logAudit({ req, action: 'CREATE_FEE_STRUCTURE', resourceType: 'fee_structure_item', resourceId: item.id });
  return ApiResponse.success(res, 201, `Fee added. Dues created for ${synced.enrollments} students.`, serializeItem(item, synced.created));
});

const updateStructureItem = asyncHandler(async (req, res) => {
  const data = updateStructureSchema.parse(req.body);
  const item = await prisma.feeStructureItem.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!item) return ApiResponse.error(res, 404, 'Structure item not found');

  const chargeCount = await prisma.studentFeeCharge.count({ where: { structureItemId: item.id } });
  const structural = data.frequency !== undefined || data.installments !== undefined || data.firstDueDate !== undefined;
  if (chargeCount > 0 && structural) {
    return ApiResponse.error(res, 409, 'Dues are already generated for this fee, so frequency, installments and due date are locked. You can still change the amount.');
  }

  const frequency = data.frequency || item.frequency;
  const update = {
    ...(data.amount !== undefined ? { amount: data.amount } : {}),
    ...(data.appliesTo ? { appliesTo: data.appliesTo } : {}),
    ...(data.frequency ? { frequency } : {}),
    ...(data.installments !== undefined || data.frequency ? { installments: frequency === 'one_time' ? 1 : data.installments ?? item.installments } : {}),
    ...(data.firstDueDate ? { firstDueDate: toDateOnly(data.firstDueDate) } : {}),
  };

  // A changed amount flows into every charge nobody has paid / discounted yet; touched ones keep their snapshot.
  const ops = [
    prisma.feeStructureItem.update({
      where: { id: item.id },
      data: update,
      include: { class: { select: { name: true } }, feeHead: { select: { name: true } } },
    }),
  ];
  if (data.amount !== undefined) {
    ops.push(prisma.studentFeeCharge.updateMany({ where: { structureItemId: item.id, paidAmount: 0, discount: 0 }, data: { amount: data.amount } }));
  }
  const [updated, propagated] = await prisma.$transaction(ops);
  const picked = propagated ? propagated.count : 0;

  await logAudit({ req, action: 'UPDATE_FEE_STRUCTURE', resourceType: 'fee_structure_item', resourceId: item.id, metadata: data });
  return ApiResponse.success(res, 200, picked ? `Updated. ${picked} unpaid dues picked up the new amount.` : 'Updated', serializeItem(updated, chargeCount));
});

const deleteStructureItem = asyncHandler(async (req, res) => {
  const item = await prisma.feeStructureItem.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!item) return ApiResponse.error(res, 404, 'Structure item not found');

  const touched = await prisma.studentFeeCharge.count({
    where: { structureItemId: item.id, OR: [{ paidAmount: { gt: 0 } }, { discount: { gt: 0 } }] },
  });
  if (touched > 0) {
    return ApiResponse.error(res, 409, 'Payments or concessions already exist against this fee, so it cannot be removed. Set the amount to 0 for future sessions instead.');
  }

  await prisma.$transaction([
    prisma.studentFeeCharge.deleteMany({ where: { structureItemId: item.id } }),
    prisma.feeStructureItem.delete({ where: { id: item.id } }),
  ]);
  await logAudit({ req, action: 'DELETE_FEE_STRUCTURE', resourceType: 'fee_structure_item', resourceId: item.id });
  return ApiResponse.success(res, 200, 'Fee removed from class structure');
});

// Year rollover helper: copy a session's structure to another session, class by class (matched by name),
// shifting every due date by the gap between the two session start dates.
const copyStructure = asyncHandler(async (req, res) => {
  const { fromSessionId, toSessionId } = copyStructureSchema.parse(req.body);
  if (fromSessionId === toSessionId) return ApiResponse.error(res, 422, 'Choose two different sessions');

  const [from, to] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: fromSessionId, schoolId: req.schoolId } }),
    prisma.academicSession.findFirst({ where: { id: toSessionId, schoolId: req.schoolId } }),
  ]);
  if (!from || !to) return ApiResponse.error(res, 404, 'Session not found');

  const [fromClasses, toClasses, items] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: req.schoolId, sessionId: fromSessionId } }),
    prisma.class.findMany({ where: { schoolId: req.schoolId, sessionId: toSessionId } }),
    prisma.feeStructureItem.findMany({ where: { schoolId: req.schoolId, sessionId: fromSessionId } }),
  ]);

  const norm = (s) => s.trim().toLowerCase();
  const toByName = Object.fromEntries(toClasses.map((c) => [norm(c.name), c]));
  const fromById = Object.fromEntries(fromClasses.map((c) => [c.id, c]));
  const shift = Math.round((to.startDate - from.startDate) / (30.4375 * 86400000));

  const rows = [];
  const unmatched = new Set();
  items.forEach((it) => {
    const src = fromById[it.classId];
    const target = src ? toByName[norm(src.name)] : null;
    if (!target) { if (src) unmatched.add(src.name); return; }
    rows.push({
      schoolId: req.schoolId, sessionId: toSessionId, classId: target.id, feeHeadId: it.feeHeadId,
      amount: it.amount, frequency: it.frequency, installments: it.installments,
      firstDueDate: addMonths(it.firstDueDate, shift), appliesTo: it.appliesTo,
    });
  });

  const result = await prisma.feeStructureItem.createMany({ data: rows, skipDuplicates: true });
  await logAudit({ req, action: 'COPY_FEE_STRUCTURE', resourceType: 'fee_structure_item', metadata: { fromSessionId, toSessionId, created: result.count } });

  return ApiResponse.success(res, 200, `${result.count} fee lines copied`, { created: result.count, unmatchedClasses: [...unmatched] });
});

// Creates every missing due for a session (active session by default). Idempotent. Allowed for admin + collector
// so new admissions can be picked up from the dashboard.
const generateDues = asyncHandler(async (req, res) => {
  const body = generateSchema.parse(req.body || {});
  let sessionId = body.sessionId;
  if (!sessionId) {
    const active = await getActiveSession(req.schoolId);
    if (!active) return ApiResponse.error(res, 422, 'No active session');
    sessionId = active.id;
  }
  const result = await syncCharges({ schoolId: req.schoolId, sessionId, classId: body.classId });
  await logAudit({ req, action: 'GENERATE_FEE_DUES', resourceType: 'fee_charge', metadata: { sessionId, classId: body.classId || null, ...result } });
  return ApiResponse.success(res, 200, `${result.created} new dues created for ${result.enrollments} students`, result);
});

module.exports = {
  getHeads, createHead, updateHead, deleteHead,
  getStructure, createStructureItem, updateStructureItem, deleteStructureItem, copyStructure, generateDues,
};