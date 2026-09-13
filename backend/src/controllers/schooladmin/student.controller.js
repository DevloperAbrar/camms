const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createStudentSchema, updateStudentSchema } = require('../../validators/schooladmin.validator');
const { generateStudentCsvTemplate, validateStudentCsv } = require('../../services/csv.service');

const createStudent = asyncHandler(async (req, res) => {
  const data = createStudentSchema.parse(req.body);

  const existing = await prisma.student.findUnique({
    where: { schoolId_enrollmentNumber: { schoolId: req.schoolId, enrollmentNumber: data.enrollmentNumber } },
  });

  if (existing) {
    return ApiResponse.error(res, 409, 'A student with this enrollment number already exists');
  }

  const result = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId: req.schoolId,
        name: data.name,
        dob: data.dob ? new Date(data.dob) : null,
        gender: data.gender,
        parentName: data.parentName,
        parentEmail: data.parentEmail,
        parentPhone: data.parentPhone,
        secondaryParentPhone: data.secondaryParentPhone,
        address: data.address,
        admissionDate: data.admissionDate ? new Date(data.admissionDate) : null,
        enrollmentNumber: data.enrollmentNumber,
        status: 'active',
      },
    });

    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        sessionId: data.sessionId,
        classId: data.classId,
        sectionId: data.sectionId,
        rollNumber: data.rollNumber,
        status: 'active',
      },
    });

    return { student, enrollment };
  });

  await logAudit({ req, action: 'CREATE_STUDENT', resourceType: 'student', resourceId: result.student.id });

  return ApiResponse.success(res, 201, 'Student added successfully', result);
});

const getStudents = asyncHandler(async (req, res) => {
  const { sessionId, classId, sectionId, search, page, limit } = req.query;
  const pageNum = page ? Number(page) : 1;
  const limitNum = limit ? Number(limit) : 30;

  const enrollmentWhere = {
    ...(sessionId ? { sessionId } : {}),
    ...(classId ? { classId } : {}),
    ...(sectionId ? { sectionId } : {}),
  };

  const where = {
    schoolId: req.schoolId,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...(Object.keys(enrollmentWhere).length ? { enrollments: { some: enrollmentWhere } } : {}),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        enrollments: {
          where: enrollmentWhere,
          include: { class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return ApiResponse.success(res, 200, 'Students fetched', {
    students,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  });
});

const updateStudent = asyncHandler(async (req, res) => {
  const data = updateStudentSchema.parse(req.body);
  const { rollNumber, ...studentFields } = data;

  const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  const updated = await prisma.$transaction(async (tx) => {
    const updatedStudent = await tx.student.update({
      where: { id: req.params.id },
      data: {
        ...studentFields,
        ...(studentFields.dob ? { dob: new Date(studentFields.dob) } : {}),
        ...(studentFields.admissionDate ? { admissionDate: new Date(studentFields.admissionDate) } : {}),
      },
    });

    if (rollNumber !== undefined) {
      const activeEnrollment = await tx.enrollment.findFirst({
        where: { studentId: req.params.id, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (activeEnrollment) {
        await tx.enrollment.update({ where: { id: activeEnrollment.id }, data: { rollNumber } });
      }
    }

    return updatedStudent;
  });

  await logAudit({ req, action: 'UPDATE_STUDENT', resourceType: 'student', resourceId: updated.id, metadata: data });

  return ApiResponse.success(res, 200, 'Student updated', updated);
});

// Never hard-delete a student — deactivating preserves their attendance and marks history
const deactivateStudent = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!student) return ApiResponse.error(res, 404, 'Student not found');

  const updated = await prisma.student.update({
    where: { id: req.params.id },
    data: { status: student.status === 'active' ? 'inactive' : 'active' },
  });

  await logAudit({
    req,
    action: updated.status === 'active' ? 'REACTIVATE_STUDENT' : 'DEACTIVATE_STUDENT',
    resourceType: 'student',
    resourceId: updated.id,
  });

  return ApiResponse.success(res, 200, `Student ${updated.status === 'active' ? 'reactivated' : 'deactivated'}`, updated);
});

const getCsvTemplate = asyncHandler(async (req, res) => {
  const csv = generateStudentCsvTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="student_upload_template.csv"');
  return res.send(csv);
});

// Step 1: validate only, nothing is saved yet — admin reviews errors first
const previewCsvUpload = asyncHandler(async (req, res) => {
  if (!req.file) return ApiResponse.error(res, 422, 'No CSV file uploaded');

  const { sessionId } = req.body;
  if (!sessionId) return ApiResponse.error(res, 422, 'sessionId is required');

  const sections = await prisma.section.findMany({
    where: { schoolId: req.schoolId, class: { sessionId } },
    include: { class: { select: { id: true, name: true } } },
  });

  const classesMap = {};
  sections.forEach((sec) => {
    classesMap[`${sec.class.name}::${sec.name}`] = { classId: sec.class.id, sectionId: sec.id };
  });

  const result = await validateStudentCsv(req.file.buffer, { schoolId: req.schoolId, sessionId, classesMap });

  return ApiResponse.success(res, 200, 'CSV validated', result);
});

// Step 2: admin confirms, only the previously-validated rows get committed
const commitCsvUpload = asyncHandler(async (req, res) => {
  const { validRows } = req.body;

  if (!Array.isArray(validRows) || validRows.length === 0) {
    return ApiResponse.error(res, 422, 'No valid rows to commit');
  }

  let created = 0;
  const errors = [];

  for (const row of validRows) {
    try {
      await prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            schoolId: req.schoolId,
            name: row.name,
            enrollmentNumber: row.enrollmentNumber,
            dob: row.dob,
            gender: row.gender,
            parentName: row.parentName,
            parentEmail: row.parentEmail,
            parentPhone: row.parentPhone,
            status: 'active',
          },
        });

        await tx.enrollment.create({
          data: {
            studentId: student.id,
            sessionId: row.sessionId,
            classId: row.classId,
            sectionId: row.sectionId,
            rollNumber: row.rollNumber,
            status: 'active',
          },
        });
      });
      created++;
    } catch (err) {
      errors.push({ enrollmentNumber: row.enrollmentNumber, error: err.message });
    }
  }

  await logAudit({ req, action: 'BULK_UPLOAD_STUDENTS', resourceType: 'student', metadata: { created, failed: errors.length } });

  return ApiResponse.success(res, 201, `${created} students added`, { created, errors });
});

module.exports = { createStudent, getStudents, updateStudent, deactivateStudent, getCsvTemplate, previewCsvUpload, commitCsvUpload };