const { z } = require('zod');
const C = require('../config/reception.constants');
const { normalizePhone } = require('../services/reception.service');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const uuid = z.string().uuid();
const opt = (schema) => schema.nullable().optional();
const text = (max) => z.string().trim().max(max);
const phone = z.string().trim().transform(normalizePhone)
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');
const customData = z.record(z.string(), z.any());

// NOTE: no .default() anywhere in the shared shapes, so PATCH requests never reset omitted fields.
const enquiryBase = z.object({
  studentName: z.string().trim().min(2).max(80),
  dob: opt(dateStr),
  gender: opt(z.enum(['male', 'female', 'other'])),
  classSought: z.string().trim().min(1).max(40),
  academicYear: opt(text(20)),
  parentName: z.string().trim().min(2).max(80),
  phone,
  altPhone: opt(phone),
  email: opt(z.string().trim().toLowerCase().email().max(120)),
  address: opt(text(300)),
  previousSchool: opt(text(120)),
  source: z.enum(C.SOURCES),
  referredBy: opt(text(80)),
  priority: z.enum(C.PRIORITIES),
  notes: opt(text(1000)),
  assignedToId: opt(uuid),
  nextFollowUpOn: opt(dateStr),
  customData,
});

const createEnquirySchema = enquiryBase
  .partial({ source: true, priority: true, customData: true })
  .extend({ force: z.boolean().optional() });
const updateEnquirySchema = enquiryBase.partial();

const stageSchema = z.object({
  stage: z.enum(C.STAGES),
  lostReason: opt(text(200)),
  note: opt(text(500)),
  nextFollowUpOn: opt(dateStr),
});

const followUpSchema = z.object({
  kind: z.enum(C.FOLLOWUP_KINDS),
  note: z.string().trim().min(1, 'Add a short note').max(1000),
  nextFollowUpOn: opt(dateStr),
  stage: z.enum(C.OPEN_STAGES).optional(),
});

const convertSchema = z.object({
  enrollmentNumber: z.string().trim().min(1).max(40),
  sessionId: uuid,
  classId: uuid,
  sectionId: uuid,
  rollNumber: opt(text(10)),
  admissionDate: opt(dateStr),
  parentEmail: opt(z.string().trim().toLowerCase().email()),
});

const createVisitorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  purpose: z.enum(C.PURPOSES),
  purposeNote: opt(text(200)),
  hostUserId: opt(uuid),
  hostName: opt(text(80)),
  studentId: opt(uuid),
  enquiryId: opt(uuid),
  headCount: z.number().int().min(1).max(50).optional(),
  idProofType: opt(z.enum(C.ID_TYPES)),
  idProofLast4: opt(z.string().trim().regex(/^[A-Za-z0-9]{3,4}$/, 'Enter the last 3-4 characters of the ID')),
  vehicleNumber: opt(z.string().trim().toUpperCase().max(15)),
  badgeNumber: opt(text(15)),
  remarks: opt(text(300)),
  customData: customData.optional(),
  force: z.boolean().optional(),
}).refine((d) => !d.idProofType || !!d.idProofLast4, {
  message: 'Enter the last digits of the ID proof',
  path: ['idProofLast4'],
});

const createFieldSchema = z.object({
  scope: z.enum(C.FIELD_SCOPES),
  label: z.string().trim().min(2).max(40),
  type: z.enum(C.FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  isRequired: z.boolean().optional(),
}).refine((d) => d.type !== 'select' || (d.options && d.options.length >= 2 && new Set(d.options).size === d.options.length), {
  message: 'A dropdown needs at least 2 different options',
  path: ['options'],
});

const updateFieldSchema = z.object({
  label: z.string().trim().min(2).max(40).optional(),
  options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  isRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const reorderFieldsSchema = z.object({
  scope: z.enum(C.FIELD_SCOPES),
  ids: z.array(uuid).min(1).max(50),
});

// reception staff logins
const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional(),
});
const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
const setStaffPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional(),
});

module.exports = {
  createEnquirySchema, updateEnquirySchema, stageSchema, followUpSchema, convertSchema,
  createVisitorSchema, createFieldSchema, updateFieldSchema, reorderFieldsSchema,
  createStaffSchema, updateStaffSchema, setStaffPasswordSchema,
};