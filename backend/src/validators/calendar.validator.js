const { z } = require('zod');

// z.guid() accepts any 8-4-4-4-12 hex id. z.string().uuid() is strict in Zod v4 and
// rejects the ids created by the calendar migration (they come from md5()::uuid).
const uuid = z.guid();

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

// The frontend sends '' for empty optional fields, treat that as "not provided"
const blankToNull = (schema) => z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

const timeSchema = blankToNull(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:MM'));

const KINDS = ['holiday', 'exam', 'event', 'working_day'];

function checkRange(data, ctx) {
  if (data.startDate && data.endDate) {
    if (data.endDate < data.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before start date' });
    } else if ((Date.parse(data.endDate) - Date.parse(data.startDate)) / 86400000 > 366) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'An event cannot span more than a year' });
    }
  }
}

const createEventSchema = z
  .object({
    sessionId: uuid,
    categoryId: uuid,
    title: z.string().trim().min(1, 'Title is required').max(120),
    description: blankToNull(z.string().trim().max(1000)),
    startDate: ymdSchema,
    endDate: blankToNull(ymdSchema),
    startTime: timeSchema,
    endTime: timeSchema,
    location: blankToNull(z.string().trim().max(120)),
    audience: z.enum(['all', 'staff']).default('all'),
    classIds: z.array(uuid).max(100).default([]),
  })
  .superRefine(checkRange);

const updateEventSchema = z
  .object({
    categoryId: uuid.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: blankToNull(z.string().trim().max(1000)),
    startDate: ymdSchema.optional(),
    endDate: blankToNull(ymdSchema),
    startTime: timeSchema,
    endTime: timeSchema,
    location: blankToNull(z.string().trim().max(120)),
    audience: z.enum(['all', 'staff']).optional(),
    classIds: z.array(uuid).max(100).optional(),
  })
  .superRefine(checkRange);

const markReviewedSchema = z.object({ sessionId: uuid });

const settingsSchema = z.object({
  sessionId: uuid,
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(6, 'At least one working day is required'),
  offSaturdays: z.array(z.number().int().min(1).max(5)).max(5),
});

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  kind: z.enum(KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be like #f97316'),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  kind: z.enum(KINDS).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const copyCalendarSchema = z.object({
  sourceSessionId: uuid,
  targetSessionId: uuid,
  mode: z.enum(['same_date', 'same_weekday']).default('same_date'),
  kinds: z.array(z.enum(KINDS)).optional(),
  copySettings: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

const exportQuerySchema = z.object({
  format: z.enum(['pdf', 'csv', 'ics']).default('pdf'),
  sessionId: uuid.optional(),
});

module.exports = {
  createEventSchema,
  updateEventSchema,
  markReviewedSchema,
  settingsSchema,
  categorySchema,
  updateCategorySchema,
  copyCalendarSchema,
  exportQuerySchema,
};