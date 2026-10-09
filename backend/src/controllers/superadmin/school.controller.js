const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { generateTempPassword } = require('../../utils/generatePassword');
const { listSchools, getSchoolWithSubscription } = require('../../services/school.service');
const { serializeSettings } = require('../../services/notes.service');
const {
  createSchoolSchema,
  resetAdminPasswordSchema,
  updateSchoolSchema,
  suspendSchoolSchema,
  changePlanSchema,
} = require('../../validators/superadmin.validator');

const createSchool = asyncHandler(async (req, res) => {
  const data = createSchoolSchema.parse(req.body);

  const existingCode = await prisma.school.findUnique({ where: { code: data.code } });
  if (existingCode) {
    return ApiResponse.error(res, 409, 'A school with this code already exists');
  }

  const existingUser = await prisma.user.findUnique({ where: { email: data.contactEmail } });
  if (existingUser) {
    return ApiResponse.error(res, 409, 'A user with this contact email already exists');
  }

  // Use the password typed by the super admin; fall back to a generated one when left blank
  const passwordSource = data.adminPassword ? 'manual' : 'generated';
  const adminPassword = data.adminPassword || generateTempPassword();
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

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

    // Seed the school's first academic session
    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        label: `${new Date(data.startDate).getFullYear()}-${new Date(data.startDate).getFullYear() + 1}`,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isActive: true,
      },
    });

    // Create the School Admin login for this school
    const admin = await tx.user.create({
      data: {
        email: data.contactEmail,
        name: `${data.name} Admin`,
        role: 'admin',
        passwordHash: adminPasswordHash,
        schoolId: school.id,
        status: 'active',
      },
    });

    return { school, subscription, session, admin };
  });

  if (data.notes && data.notes.enabled) {
    await prisma.schoolNotesSettings.upsert({
      where: { schoolId: result.school.id },
      create: { schoolId: result.school.id, enabled: true, quotaMb: data.notes.quotaMb, maxFileMb: data.notes.maxFileMb },
      update: { enabled: true, quotaMb: data.notes.quotaMb, maxFileMb: data.notes.maxFileMb, disabledAt: null },
    });
  }

  await logAudit({
    req,
    action: 'CREATE_SCHOOL',
    resourceType: 'school',
    resourceId: result.school.id,
    metadata: { name: data.name, code: data.code, passwordSource },
  });

  return ApiResponse.success(res, 201, 'School onboarded successfully', {
    school: result.school,
    subscription: result.subscription,
    session: result.session,
    admin: { id: result.admin.id, email: result.admin.email, name: result.admin.name },
    adminPassword,
  });
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
  const { notes: notesInput, ...schoolData } = updateSchoolSchema.parse(req.body);
  const schoolId = req.params.id;

  const existing = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!existing) return ApiResponse.error(res, 404, 'School not found');

  // School details and the Notes add-on are saved together so a failure never leaves a half-applied edit
  const { school, notesRow } = await prisma.$transaction(async (tx) => {
    const updated = Object.keys(schoolData).length
      ? await tx.school.update({ where: { id: schoolId }, data: schoolData })
      : await tx.school.findUnique({ where: { id: schoolId } });

    let row = null;
    if (notesInput) {
      const current = await tx.schoolNotesSettings.findUnique({ where: { schoolId } });

      // Never allow a quota below what the school has already stored
      if (notesInput.enabled && current && notesInput.quotaMb * 1048576 < Number(current.usedBytes)) {
        const usedMb = Math.ceil(Number(current.usedBytes) / 1048576);
        throw httpError(400, `This school has already used ${usedMb} MB. Choose a storage quota above that.`);
      }

      row = await tx.schoolNotesSettings.upsert({
        where: { schoolId },
        create: {
          schoolId,
          enabled: notesInput.enabled,
          quotaMb: notesInput.quotaMb,
          maxFileMb: notesInput.maxFileMb,
          disabledAt: notesInput.enabled ? null : new Date(),
        },
        update: {
          enabled: notesInput.enabled,
          quotaMb: notesInput.quotaMb,
          maxFileMb: notesInput.maxFileMb,
          disabledAt: notesInput.enabled ? null : (current?.disabledAt ?? new Date()),
        },
      });
    }

    return { school: updated, notesRow: row };
  });

  await logAudit({ req, action: 'UPDATE_SCHOOL', resourceType: 'school', resourceId: school.id, metadata: schoolData });

  if (notesInput) {
    req.body = { ...req.body, schoolId: school.id }; // logAudit reads the target school from the body for super admins
    await logAudit({ req, action: 'NOTES_SETTINGS_UPDATE', resourceType: 'school', resourceId: school.id, metadata: notesInput });
  }

  return ApiResponse.success(res, 200, 'School updated', {
    ...school,
    notes: notesRow ? serializeSettings(notesRow) : undefined,
  });
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

// Sets the school admin's password: the one typed by the super admin, or a generated one when left blank
const resetAdminPassword = asyncHandler(async (req, res) => {
  // Express 5: req.body is undefined when the request has no body
  const { password: chosenPassword } = resetAdminPasswordSchema.parse(req.body || {});

  const admin = await prisma.user.findFirst({
    where: { schoolId: req.params.id, role: 'admin' },
  });

  if (!admin) return ApiResponse.error(res, 404, 'No admin account found for this school');

  const passwordSource = chosenPassword ? 'manual' : 'generated';
  const newPassword = chosenPassword || generateTempPassword();
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({ where: { id: admin.id }, data: { passwordHash } });

  await logAudit({
    req,
    action: 'RESET_SCHOOL_ADMIN_PASSWORD',
    resourceType: 'user',
    resourceId: admin.id,
    metadata: { schoolId: req.params.id, passwordSource },
  });

  return ApiResponse.success(res, 200, 'Admin password reset', {
    email: admin.email,
    password: newPassword,
  });
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
  resetAdminPassword,
  impersonateSchoolAdmin,
};