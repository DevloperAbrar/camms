const { z } = require('zod');

const createSessionSchema = z.object({
  label: z.string().min(4),
  startDate: z.string(),
  endDate: z.string(),
});

const createClassSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});

const createSectionSchema = z.object({
  classId: z.string().uuid(),
  name: z.string().min(1),
  classTeacherId: z.string().uuid().optional().nullable(),
});

const createSubjectSchema = z.object({
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().optional(),
});

const copySubjectsSchema = z.object({
  fromSessionId: z.string().uuid(),
  fromClassId: z.string().uuid(),
  toSessionId: z.string().uuid(),
  toClassId: z.string().uuid(),
});

const createFacultySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  usePasswordLogin: z.boolean().default(false),
  password: z.string().min(6).optional(),
});

const assignFacultySchema = z.object({
  facultyId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

const createStudentSchema = z.object({
  name: z.string().min(2),
  dob: z.string().optional(),
  gender: z.string().optional(),
  parentName: z.string().optional(),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().optional(),
  secondaryParentPhone: z.string().optional(),
  address: z.string().optional(),
  admissionDate: z.string().optional(),
  enrollmentNumber: z.string().min(1),
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  rollNumber: z.string().optional(),
});

const promoteStudentsSchema = z.object({
  fromSessionId: z.string().uuid(),
  toSessionId: z.string().uuid(),
  promotions: z.array(
    z.object({
      studentId: z.string().uuid(),
      action: z.enum(['promoted', 'retained', 'transferred_out', 'graduated']),
      toClassId: z.string().uuid().optional(),
      toSectionId: z.string().uuid().optional(),
      rollNumber: z.string().optional(),
    })
  ).min(1),
});

module.exports = {
  createSessionSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  copySubjectsSchema,
  createFacultySchema,
  assignFacultySchema,
  createStudentSchema,
  promoteStudentsSchema,
};