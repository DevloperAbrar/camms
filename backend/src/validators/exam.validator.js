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
  overrideMarkSchema,
  createHolidaySchema,
  reviewCorrectionSchema,
};