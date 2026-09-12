const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { listSchools, getSchoolWithSubscription } = require('../../services/school.service');
const {
  createSchoolSchema,
  updateSchoolSchema,
  suspendSchoolSchema,
  changePlanSchema,
} = require('../../validators/superadmin.validator');

const createSchool = asyncHandler(async (req, res) => {
  const data = createSchoolSchema.parse(req.body);

  const existing = await prisma.school.findUnique({ where: { code: data.code } });
  if (existing) {
    return ApiResponse.error(res, 409, 'A school with this code already exists');
  }

  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name: data.name,
        code: data.code,
        address: data.address,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        timezone: data.timezone,
        status: 'trial',
      },
    });

    const subscription = await tx.schoolSubscription.create({
      data: {
        schoolId: school.id,
        planId: data.planId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'trial',
        createdBy: req.user.id,
      },
    });

    // Seed the school's first academic session and its first admin invite slot
    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        label: `${new Date(data.startDate).getFullYear()}-${new Date(data.startDate).getFullYear() + 1}`,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isActive: true,
      },
    });

    return { school, subscription, session };
  });

  await logAudit({
    req,
    action: 'CREATE_SCHOOL',
    resourceType: 'school',
    resourceId: result.school.id,
    metadata: { name: data.name, code: data.code },
  });

  return ApiResponse.success(res, 201, 'School onboarded successfully', result);
});

const getSchools = asyncHandler(async (req, res) => {
  const { status, search, page, limit } = req.query;
  const result = await listSchools({
    status,
    search,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  return ApiResponse.success(res, 200, 'Schools fetched', result);
});

const getSchoolById = asyncHandler(async (req, res) => {
  const school = await getSchoolWithSubscription(req.params.id);
  if (!school) return ApiResponse.error(res, 404, 'School not found');
  return ApiResponse.success(res, 200, 'School fetched', school);
});

const updateSchool = asyncHandler(async (req, res) => {
  const data = updateSchoolSchema.parse(req.body);

  const school = await prisma.school.update({
    where: { id: req.params.id },
    data,
  });

  await logAudit({ req, action: 'UPDATE_SCHOOL', resourceType: 'school', resourceId: school.id, metadata: data });

  return ApiResponse.success(res, 200, 'School updated', school);
});

const suspendSchool = asyncHandler(async (req, res) => {
  const { reason } = suspendSchoolSchema.parse(req.body);

  const school = await prisma.school.update({
    where: { id: req.params.id },
    data: { status: 'suspended' },
  });

  await logAudit({
    req,
    action: 'SUSPEND_SCHOOL',
    resourceType: 'school',
    resourceId: school.id,
    metadata: { reason },
  });

  return ApiResponse.success(res, 200, 'School suspended', school);
});

const reactivateSchool = asyncHandler(async (req, res) => {
  const school = await prisma.school.update({
    where: { id: req.params.id },
    data: { status: 'active' },
  });

  await logAudit({ req, action: 'REACTIVATE_SCHOOL', resourceType: 'school', resourceId: school.id });

  return ApiResponse.success(res, 200, 'School reactivated', school);
});

const changeSchoolPlan = asyncHandler(async (req, res) => {
  const { planId } = changePlanSchema.parse(req.body);

  const latestSub = await prisma.schoolSubscription.findFirst({
    where: { schoolId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestSub) return ApiResponse.error(res, 404, 'No subscription found for this school');

  const updated = await prisma.schoolSubscription.update({
    where: { id: latestSub.id },
    data: { planId },
  });

  await logAudit({
    req,
    action: 'CHANGE_SCHOOL_PLAN',
    resourceType: 'school_subscription',
    resourceId: updated.id,
    metadata: { newPlanId: planId },
  });

  return ApiResponse.success(res, 200, 'Plan changed successfully', updated);
});

// Time-boxed, audit-logged impersonation for support cases
const impersonateSchoolAdmin = asyncHandler(async (req, res) => {
  const { signToken } = require('../../utils/jwt');
  const env = require('../../config/env');
  const constants = require('../../config/constants');

  const admin = await prisma.user.findFirst({
    where: { schoolId: req.params.id, role: 'admin', status: 'active' },
  });

  if (!admin) return ApiResponse.error(res, 404, 'No active admin found for this school');

  const token = signToken({ id: admin.id, role: admin.role, schoolId: admin.schoolId, impersonatedBy: req.user.id });

  res.cookie(constants.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 60 * 1000, // 30-minute time-boxed session
  });

  await logAudit({
    req,
    action: 'IMPERSONATE_SCHOOL_ADMIN',
    resourceType: 'user',
    resourceId: admin.id,
    metadata: { schoolId: req.params.id },
  });

  return ApiResponse.success(res, 200, 'Impersonation session started (30 min)', {
    adminName: admin.name,
    schoolId: admin.schoolId,
  });
});

module.exports = {
  createSchool,
  getSchools,
  getSchoolById,
  updateSchool,
  suspendSchool,
  reactivateSchool,
  changeSchoolPlan,
  impersonateSchoolAdmin,
};