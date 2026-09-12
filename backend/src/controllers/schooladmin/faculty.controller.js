const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createFacultySchema, assignFacultySchema } = require('../../validators/schooladmin.validator');

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
  getFacultyAssignments,
  assignFaculty,
  removeFacultyAssignment,
};