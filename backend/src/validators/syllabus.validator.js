const { z } = require('zod');

// z.guid() accepts any 8-4-4-4-12 hex id (same reason as calendar.validator.js)
const uuid = z.guid();

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

// The frontend sends '' for empty optional fields, treat that as "not provided"
const blankToNull = (schema) => z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

const title = z.string().trim().min(1, 'Chapter name is required').max(200);
const unitName = blankToNull(z.string().trim().max(120));
const periods = z.coerce.number().int().min(1, 'Periods must be at least 1').max(100);

function checkRange(data, ctx) {
  if (data.plannedStart && data.plannedEnd && data.plannedEnd < data.plannedStart) {
    ctx.addIssue({ code: 'custom', path: ['plannedEnd'], message: 'Planned end cannot be before planned start' });
  }
}

const createChapterSchema = z
  .object({
    sessionId: uuid,
    classId: uuid,
    subjectId: uuid,
    title,
    unitName,
    plannedPeriods: periods.default(1),
    plannedStart: blankToNull(ymdSchema),
    plannedEnd: blankToNull(ymdSchema),
    sortOrder: z.number().int().min(0).optional(),
  })
  .superRefine(checkRange);

const updateChapterSchema = z
  .object({
    title: title.optional(),
    unitName,
    plannedPeriods: periods.optional(),
    plannedStart: blankToNull(ymdSchema),
    plannedEnd: blankToNull(ymdSchema),
    sortOrder: z.number().int().min(0).optional(),
  })
  .superRefine(checkRange);

const bulkChaptersSchema = z.object({
  sessionId: uuid,
  classId: uuid,
  subjectId: uuid,
  chapters: z
    .array(z.object({ title, unitName, plannedPeriods: periods.default(1) }))
    .min(1, 'Add at least one chapter')
    .max(200, 'Add at most 200 chapters at a time'),
});

const applyTemplateSchema = z.object({
  templateId: uuid,
  sessionId: uuid,
  classId: uuid,
  subjectId: uuid,
});

const saveTemplateSchema = z.object({
  sessionId: uuid,
  classId: uuid,
  subjectId: uuid,
  board: z.string().trim().min(1, 'Board / name is required').max(60),
});

const csvImportSchema = z.object({
  sessionId: uuid,
  dryRun: z.enum(['true', 'false']).default('true'),
});

const copySyllabusSchema = z.object({
  fromSessionId: uuid,
  toSessionId: uuid,
  dryRun: z.boolean().default(false),
});

const scheduleSchema = z
  .object({
    sessionId: uuid,
    classId: uuid,
    subjectId: uuid.optional(),
    startDate: ymdSchema,
    endDate: ymdSchema,
  })
  .superRefine((d, ctx) => {
    if (d.endDate < d.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before start date' });
  });

const examScopeSchema = z.object({
  examTypeId: uuid,
  subjectId: uuid,
  chapterIds: z.array(uuid).max(300),
});

const progressItem = z
  .object({
    chapterId: uuid,
    status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
    percentDone: z.coerce.number().int().min(0).max(100).optional(),
    isRevised: z.boolean().optional(),
    remarks: blankToNull(z.string().trim().max(300)),
    completedOn: blankToNull(ymdSchema),
  })
  .refine((u) => u.status !== undefined || u.percentDone !== undefined, {
    message: 'Provide a status or a percentage for every chapter',
  });

const saveProgressSchema = z.object({
  sessionId: uuid,
  classId: uuid,
  sectionId: uuid,
  subjectId: uuid,
  updates: z.array(progressItem).min(1).max(100),
});

const reminderSchema = z.object({
  sessionId: uuid,
  sectionId: uuid,
  subjectId: uuid,
  note: blankToNull(z.string().trim().max(200)),
});

module.exports = {
  createChapterSchema,
  updateChapterSchema,
  bulkChaptersSchema,
  applyTemplateSchema,
  saveTemplateSchema,
  csvImportSchema,
  copySyllabusSchema,
  scheduleSchema,
  examScopeSchema,
  saveProgressSchema,
  reminderSchema,
};