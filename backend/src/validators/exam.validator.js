const { z } = require('zod');

const createExamTypeSchema = z.object({
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  weightagePercent: z.number().min(0).max(100).optional(),
});

const addExamSubjectSchema = z.object({
  examTypeId: z.string().uuid(),
  subjectId: z.string().uuid(),
  maxMarks: z.number().positive(),
  passingMarks: z.number().nonnegative(),
});

const updateExamSubjectSchema = z.object({
  maxMarks: z.number().positive().optional(),
  passingMarks: z.number().nonnegative().optional(),
});

const forceUnlockSchema = z.object({
  reason: z.string().min(5),
});

const copyExamConfigSchema = z.object({
  sourceSessionId: z.string().uuid(),
  sourceClassId: z.string().uuid(),
  targetSessionId: z.string().uuid(),
  targetClassId: z.string().uuid(),
});

// Copy subjects+marks from a source exam type INTO an existing target exam type
const copyExamSubjectsSchema = z.object({
  sourceExamTypeId: z.string().uuid(), // e.g. Class 6's "Periodic Test 1" id
});

const updateExamTypeSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  weightagePercent: z.number().min(0).max(100).nullable().optional(),
});

const overrideMarkSchema = z.object({
  marksObtained: z.number().nonnegative(),
  reason: z.string().min(5),
});

const createHolidaySchema = z.object({
  sessionId: z.string().uuid(),
  date: z.string(),
  description: z.string().optional(),
});

const reviewCorrectionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().optional(),
});

module.exports = {
  createExamTypeSchema,
  addExamSubjectSchema,
  updateExamSubjectSchema,
  forceUnlockSchema,
  copyExamConfigSchema,
  copyExamSubjectsSchema,
  updateExamTypeSchema,
  overrideMarkSchema,
  createHolidaySchema,
  reviewCorrectionSchema,
};