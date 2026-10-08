const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { generateTempPassword } = require('../../utils/generatePassword');
const { createStaffSchema, updateStaffSchema, setStaffPasswordSchema } = require('../../validators/reception.validator');

const ROLE = 'receptionist';
const SAFE = { id: true, name: true, email: true, status: true, lastLogin: true, createdAt: true };

const findOwn = (req) =>
  prisma.user.findFirst({ where: { id: req.params.id, schoolId: req.schoolId, role: ROLE, status: { not: 'deleted' } } });

const listStaff = asyncHandler(async (req, res) => {
  const staff = await prisma.user.findMany({
    where: { schoolId: req.schoolId, role: ROLE, status: { not: 'deleted' } },
    select: SAFE,
    orderBy: { createdAt: 'asc' },
  });
  const ids = staff.map((s) => s.id);

  const [enq, vis] = await Promise.all([
    prisma.enquiry.groupBy({ by: ['createdById'], where: { schoolId: req.schoolId, createdById: { in: ids } }, _count: { _all: true } }),
    prisma.visitor.groupBy({ by: ['checkInById'], where: { schoolId: req.schoolId, checkInById: { in: ids } }, _count: { _all: true } }),
  ]);
  const enqBy = Object.fromEntries(enq.map((e) => [e.createdById, e._count._all]));
  const visBy = Object.fromEntries(vis.map((v) => [v.checkInById, v._count._all]));

  return ApiResponse.success(res, 200, 'Reception staff fetched', staff.map((s) => ({
    ...s, enquiryCount: enqBy[s.id] || 0, visitorCount: visBy[s.id] || 0,
  })));
});

const createStaff = asyncHandler(async (req, res) => {
  const data = createStaffSchema.parse(req.body);

  const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } } });
  if (existing) return ApiResponse.error(res, 409, 'A user with this email already exists');

  const password = data.password || generateTempPassword();
  const user = await prisma.user.create({
    data: {
      schoolId: req.schoolId, role: ROLE, name: data.name, email: data.email,
      passwordHash: await bcrypt.hash(password, 10), status: 'active',
    },
    select: SAFE,
  });

  await logAudit({ req, action: 'CREATE_RECEPTION_STAFF', resourceType: 'user', resourceId: user.id });
  // The plain password is returned exactly once so the admin can hand it over.
  return ApiResponse.success(res, 201, 'Receptionist created', { ...user, password });
});

const updateStaff = asyncHandler(async (req, res) => {
  const data = updateStaffSchema.parse(req.body);
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Receptionist not found');

  if (data.email && data.email !== staff.email) {
    const clash = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: 'insensitive' }, id: { not: staff.id } },
    });
    if (clash) return ApiResponse.error(res, 409, 'A user with this email already exists');
  }

  const updated = await prisma.user.update({ where: { id: staff.id }, data, select: SAFE });
  await logAudit({ req, action: 'UPDATE_RECEPTION_STAFF', resourceType: 'user', resourceId: staff.id, metadata: data });
  return ApiResponse.success(res, 200, 'Receptionist updated', updated);
});

const setStaffPassword = asyncHandler(async (req, res) => {
  const { password: chosen } = setStaffPasswordSchema.parse(req.body || {});
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Receptionist not found');

  const password = chosen || generateTempPassword();
  await prisma.user.update({ where: { id: staff.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  await logAudit({ req, action: 'SET_RECEPTION_STAFF_PASSWORD', resourceType: 'user', resourceId: staff.id });
  return ApiResponse.success(res, 200, 'Password updated', { email: staff.email, password });
});

// Accounts with no history are hard-deleted. Accounts that logged enquiries/visitors (or have audit
// entries) are anonymised and locked so records stay intact. Their open enquiries become unassigned.
const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await findOwn(req);
  if (!staff) return ApiResponse.error(res, 404, 'Receptionist not found');

  const [enq, vis, fu, audits] = await Promise.all([
    prisma.enquiry.count({ where: { createdById: staff.id } }),
    prisma.visitor.count({ where: { checkInById: staff.id } }),
    prisma.enquiryFollowUp.count({ where: { doneById: staff.id } }),
    prisma.auditLog.count({ where: { actorId: staff.id } }),
  ]);

  await prisma.enquiry.updateMany({ where: { schoolId: req.schoolId, assignedToId: staff.id }, data: { assignedToId: null } });

  if (enq + vis + fu + audits === 0) {
    await prisma.user.delete({ where: { id: staff.id } });
  } else {
    await prisma.user.update({
      where: { id: staff.id },
      data: { status: 'deleted', passwordHash: null, googleId: null, email: `removed+${staff.id}@deleted.invalid` },
    });
  }

  await logAudit({ req, action: 'DELETE_RECEPTION_STAFF', resourceType: 'user', resourceId: staff.id, metadata: { name: staff.name, email: staff.email } });
  return ApiResponse.success(res, 200, 'Receptionist deleted. Past records remain on file.');
});

module.exports = { listStaff, createStaff, updateStaff, setStaffPassword, deleteStaff };