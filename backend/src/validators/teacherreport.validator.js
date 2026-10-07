const { z } = require('zod');

// z.guid() accepts any 8-4-4-4-12 hex id (same reason as syllabus.validator.js)
const uuid = z.guid();

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

// The frontend may send '' for an empty filter, treat that as "not provided"
const opt = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

const rangeQuerySchema = z.object({
  sessionId: opt(uuid),
  from: opt(ymd),
  to: opt(ymd),
  classId: opt(uuid),
});

const teacherQuerySchema = rangeQuerySchema;

const idParamSchema = z.object({ id: uuid });

const dayDetailQuerySchema = z.object({
  sessionId: opt(uuid),
  facultyId: uuid,
  date: ymd,
});

const exportQuerySchema = rangeQuerySchema.extend({
  type: z.enum(['summary', 'pending', 'marks', 'daily']).default('summary'),
});

const reminderSchema = z.object({
  sessionId: opt(uuid),
  from: opt(ymd),
  to: opt(ymd),
  classId: opt(uuid),
  kind: z.enum(['attendance', 'marks']),
  facultyIds: z.array(uuid).min(1, 'Select at least one teacher').max(200),
  note: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional()),
});

module.exports = { rangeQuerySchema, teacherQuerySchema, idParamSchema, dayDetailQuerySchema, exportQuerySchema, reminderSchema };