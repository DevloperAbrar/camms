const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { generateTempPassword } = require('../../utils/generatePassword');
const { createFeeStaffSchema, updateFeeStaffSchema, setFeeStaffPasswordSchema } = require('../../validators/fee.validator');

const ROLE = 'fee_collector';
const SAFE = { id: true, name: true, email: true, status: true, lastLogin: true, createdAt: true };

const findOwn = (req) =>
  prisma.user.findFirst({ where: { id: req.params.id, schoolId: req.schoolId, role: ROLE, status: { not: 'deleted' } } });

const listFeeStaff = asyncHandler(async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { schoolId: req.schoolId, role: ROLE, status: { not: 'deleted' } },
    select: SAFE,
    orderBy: { createdAt: 'asc' },
  });

  const totals = await prisma.feeReceipt.groupBy({
    by: ['collectedById'],
    where: { schoolId: req.schoolId, status: 'active', collectedById: { in: staff.map((s) => s.id) } },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });
  const byId = Object.fromEntries(totals.map((t) => [t.collectedById, t]));

  return ApiResponse.success(res, 200, 'Fee staff fetched', staff.map((s) => ({
    ...s,
    receiptCount: byId[s.id] ? byId[s.id]._count._all : 0,
    totalCollected: byId[s.id] ? Number(byId[s.id]._sum.totalAmount || 0) : 0,
  })));
});

const createFeeStaff = asyncHandler(async (req, res) => {
  const data = createFeeStaffSchema.parse(req.body);

  const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } } });
  if (existing) return ApiResponse.error(res, 409, 'A user with this email already exists');

  const password = data.password || generateTempPassword();
  const user = await prisma.user.create({
    data: {
      schoolId: req.schoolId,
      role: ROLE,
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(password, 10),
      status: 'active',
    },
    select: SAFE,
  });

  await logAudit({ req, action: 'CREATE_FEE_STAFF', resourceType: 'user', resourceId: user.id });

  // The plain password is returned exactly once so the admin can hand it over.
  return ApiResponse.success(res, 201, 'Fee collector created', { ...user, password });
});

const updateFeeStaff = asyncHandler(async (req, res) => {
  const data = updateFeeStaffSchema.parse(req.body);
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Fee collector not found');

  if (data.email && data.email !== staff.email) {
    const clash = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' }, id: { not: staff.id } },
    });
    if (clash) return ApiResponse.error(res, 409, 'A user with this email already exists');
  }

  const updated = await prisma.user.update({ where: { id: staff.id }, data, select: SAFE });
  await logAudit({ req, action: 'UPDATE_FEE_STAFF', resourceType: 'user', resourceId: staff.id, metadata: data });
  return ApiResponse.success(res, 200, 'Fee collector updated', updated);
});

// Admin sets a chosen password, or leaves it empty to auto-generate one.
const setFeeStaffPassword = asyncHandler(async (req, res) => {
  const { password: chosen } = setFeeStaffPasswordSchema.parse(req.body || {});
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Fee collector not found');

  const password = chosen || generateTempPassword();
  await prisma.user.update({ where: { id: staff.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await logAudit({ req, action: 'SET_FEE_STAFF_PASSWORD', resourceType: 'user', resourceId: staff.id });

  return ApiResponse.success(res, 200, 'Password updated', { email: staff.email, password });
});

// Accounts with no history are hard-deleted. Accounts that already collected fees (or have audit
// entries) are anonymised and locked, so receipts and audit logs stay intact. Email is freed either way.
const deleteFeeStaff = asyncHandler(async (req, res) => {
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Fee collector not found');

  const [receipts, audits] = await Promise.all([
    prisma.feeReceipt.count({ where: { collectedById: staff.id } }),
    prisma.auditLog.count({ where: { actorId: staff.id } }),
  ]);

  if (receipts === 0 && audits === 0) {
    await prisma.user.delete({ where: { id: staff.id } });
  } else {
    await prisma.user.update({
      where: { id: staff.id },
      data: { status: 'deleted', passwordHash: null, googleId: null, email: `removed+${staff.id}@deleted.invalid` },
    });
  }

  await logAudit({ req, action: 'DELETE_FEE_STAFF', resourceType: 'user', resourceId: staff.id, metadata: { name: staff.name, email: staff.email } });
  return ApiResponse.success(res, 200, 'Fee collector deleted. Past receipts remain on record.');
});

module.exports = { listFeeStaff, createFeeStaff, updateFeeStaff, setFeeStaffPassword, deleteFeeStaff };