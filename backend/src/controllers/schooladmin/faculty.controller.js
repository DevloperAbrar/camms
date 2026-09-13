const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { generateTempPassword } = require('../../utils/generatePassword');
const { createFacultySchema, updateFacultySchema, assignFacultySchema, updateFacultyAssignmentSchema } = require('../../validators/schooladmin.validator');

const createFaculty = asyncHandler(async (req, res) => {
  const data = createFacultySchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return ApiResponse.error(res, 409, 'A user with this email already exists');
  }

  let passwordHash = null;
  if (data.usePasswordLogin) {
    if (!data.password) return ApiResponse.error(res, 422, 'Password is required for password-based login');
    passwordHash = await bcrypt.hash(data.password, 10);
  }

  const faculty = await prisma.user.create({
    data: {
      schoolId: req.schoolId,
      role: 'faculty',
      name: data.name,
      email: data.email,
      passwordHash,
      status: 'active',
    },
  });

  await logAudit({ req, action: 'CREATE_FACULTY', resourceType: 'user', resourceId: faculty.id });

  return ApiResponse.success(res, 201, 'Faculty added. They can now log in with this exact email.', {
    id: faculty.id,
    name: faculty.name,
    email: faculty.email,
  });
});

const getFacultyList = asyncHandler(async (req, res) => {
  const faculty = await prisma.user.findMany({
    where: { schoolId: req.schoolId, role: 'faculty' },
    select: { id: true, name: true, email: true, status: true, lastLogin: true },
  });

  return ApiResponse.success(res, 200, 'Faculty list fetched', faculty);
});

const updateFaculty = asyncHandler(async (req, res) => {
  const data = updateFacultySchema.parse(req.body);

  const faculty = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId, role: 'faculty' },
  });
  if (!faculty) return ApiResponse.error(res, 404, 'Faculty not found');

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, name: true, email: true, status: true, lastLogin: true },
  });

  await logAudit({ req, action: 'UPDATE_FACULTY', resourceType: 'user', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Faculty updated', updated);
});

// Never hard-delete a faculty account (attendance/marks history stays attributed to them)
// — deactivating blocks login while keeping every past record intact
const deactivateFaculty = asyncHandler(async (req, res) => {
  const faculty = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId, role: 'faculty' },
  });
  if (!faculty) return ApiResponse.error(res, 404, 'Faculty not found');

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: faculty.status === 'active' ? 'inactive' : 'active' },
    select: { id: true, name: true, email: true, status: true },
  });

  await logAudit({
    req,
    action: updated.status === 'active' ? 'REACTIVATE_FACULTY' : 'DEACTIVATE_FACULTY',
    resourceType: 'user',
    resourceId: updated.id,
  });

  return ApiResponse.success(res, 200, `Faculty ${updated.status === 'active' ? 'reactivated' : 'deactivated'}`, updated);
});

const resetFacultyPassword = asyncHandler(async (req, res) => {
  const faculty = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId, role: 'faculty' },
  });
  if (!faculty) return ApiResponse.error(res, 404, 'Faculty not found');

  const newPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({ where: { id: faculty.id }, data: { passwordHash } });

  await logAudit({ req, action: 'RESET_FACULTY_PASSWORD', resourceType: 'user', resourceId: faculty.id });

  return ApiResponse.success(res, 200, 'Password reset', { email: faculty.email, password: newPassword });
});

const getFacultyAssignments = asyncHandler(async (req, res) => {
  const assignments = await prisma.facultyAssignment.findMany({
    where: { faculty: { schoolId: req.schoolId }, isActive: true, ...(req.query.facultyId ? { facultyId: req.query.facultyId } : {}) },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { name: true } },
      faculty: { select: { name: true, email: true } },
    },
  });

  return ApiResponse.success(res, 200, 'Assignments fetched', assignments);
});

// Dynamic many-to-many mapping: faculty <-> class <-> section <-> subject
const assignFaculty = asyncHandler(async (req, res) => {
  const data = assignFacultySchema.parse(req.body);

  const existing = await prisma.facultyAssignment.findFirst({
    where: {
      facultyId: data.facultyId,
      classId: data.classId,
      sectionId: data.sectionId,
      subjectId: data.subjectId,
      sessionId: data.sessionId,
      isActive: true,
    },
  });

  if (existing) {
    return ApiResponse.error(res, 409, 'This exact assignment already exists');
  }

  const assignment = await prisma.facultyAssignment.create({ data });

  await logAudit({ req, action: 'ASSIGN_FACULTY', resourceType: 'faculty_assignment', resourceId: assignment.id });

  return ApiResponse.success(res, 201, 'Faculty assigned successfully', assignment);
});

const updateFacultyAssignment = asyncHandler(async (req, res) => {
  const data = updateFacultyAssignmentSchema.parse(req.body);

  const current = await prisma.facultyAssignment.findUnique({ where: { id: req.params.id } });
  if (!current) return ApiResponse.error(res, 404, 'Assignment not found');

  const merged = {
    facultyId: data.facultyId ?? current.facultyId,
    classId: data.classId ?? current.classId,
    sectionId: data.sectionId ?? current.sectionId,
    subjectId: data.subjectId ?? current.subjectId,
    sessionId: data.sessionId ?? current.sessionId,
  };

  const duplicate = await prisma.facultyAssignment.findFirst({
    where: { ...merged, isActive: true, id: { not: req.params.id } },
  });
  if (duplicate) {
    return ApiResponse.error(res, 409, 'This exact assignment already exists');
  }

  const updated = await prisma.facultyAssignment.update({
    where: { id: req.params.id },
    data: merged,
  });

  await logAudit({ req, action: 'UPDATE_FACULTY_ASSIGNMENT', resourceType: 'faculty_assignment', resourceId: updated.id, metadata: merged });

  return ApiResponse.success(res, 200, 'Assignment updated', updated);
}); 

// Never hard-delete — mark inactive so past attendance/marks stay correctly attributed
const removeFacultyAssignment = asyncHandler(async (req, res) => {
  const assignment = await prisma.facultyAssignment.update({
    where: { id: req.params.id },
    data: { isActive: false, removedAt: new Date() },
  });

  await logAudit({ req, action: 'REMOVE_FACULTY_ASSIGNMENT', resourceType: 'faculty_assignment', resourceId: assignment.id });

  return ApiResponse.success(res, 200, 'Assignment removed. Past records remain attributed to this faculty.', assignment);
});

module.exports = {
  createFaculty,
  getFacultyList,
  updateFaculty,
  deactivateFaculty,
  resetFacultyPassword,
  getFacultyAssignments,
  assignFaculty,
  updateFacultyAssignment,
  removeFacultyAssignment,
};