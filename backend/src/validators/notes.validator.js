const { z } = require('zod');
const { NOTE_TYPES, LIMITS } = require('../config/notes.constants');

const uuid = z.string().uuid();

const audienceSchema = z.object({
  mode: z.enum(['sections', 'students']),
  sectionIds: z.array(uuid).max(30).default([]),
  studentIds: z.array(uuid).max(300).default([]),
});

const createNoteSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  type: z.enum(NOTE_TYPES).default('note'),
  classId: uuid,
  subjectId: uuid,
  chapterId: uuid.nullable().optional(),
  sessionId: uuid.optional(),
  contentHtml: z.string().max(LIMITS.maxHtmlChars).default(''),
  allowDownload: z.boolean().default(true),
  audience: audienceSchema.default({ mode: 'sections', sectionIds: [], studentIds: [] }),
});

// No defaults here on purpose: a missing field must mean "leave unchanged".
const updateNoteSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200).optional(),
  type: z.enum(NOTE_TYPES).optional(),
  classId: uuid.optional(),
  subjectId: uuid.optional(),
  chapterId: uuid.nullable().optional(),
  contentHtml: z.string().max(LIMITS.maxHtmlChars).optional(),
  allowDownload: z.boolean().optional(),
  audience: audienceSchema.optional(),
});

const publishSchema = z.object({
  publishAt: z.string().datetime().nullable().optional(),
});

const initiateUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['file', 'inline_image']).default('file'),
});

const linkSchema = z.object({
  title: z.string().trim().min(1).max(150),
  url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Only http/https links are allowed'),
});

const takedownSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(300),
});

const notesEntitlementSchema = z.object({
  enabled: z.boolean(),
  quotaMb: z.number().int().min(100).max(512000),
  maxFileMb: z.number().int().min(1).max(LIMITS.fileMbCeiling),
});

module.exports = {
  createNoteSchema, updateNoteSchema, publishSchema, initiateUploadSchema,
  linkSchema, takedownSchema, notesEntitlementSchema,
};