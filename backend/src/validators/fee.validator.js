const { z } = require('zod');
const { PAYMENT_MODES } = require('../config/constants');

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const uuid = z.string().uuid();
const optText = (max) => z.string().trim().max(max).nullable().optional();
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const FREQUENCIES = ['one_time', 'monthly', 'quarterly', 'half_yearly', 'yearly'];

// fee staff
const createFeeStaffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional(),
});
const updateFeeStaffSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
const setFeeStaffPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(72).optional(),
});

// settings
const settingsSchema = z.object({
  displayName: optText(120),
  tagline: optText(160),
  address: optText(300),
  phone: optText(30),
  email: z.union([z.string().trim().email(), z.literal('')]).nullable().optional(),
  website: optText(120),
  headerFields: z.array(z.object({ label: z.string().trim().min(1).max(30), value: z.string().trim().min(1).max(100) })).max(8).optional(),
  gstEnabled: z.boolean().optional(),
  gstin: z.string().trim().toUpperCase().nullable().optional()
    .refine((v) => !v || GSTIN_RE.test(v), 'Invalid GSTIN (15 characters, e.g. 23ABCDE1234F1Z5)'),
  panNumber: optText(15),
  bankName: optText(80),
  accountName: optText(80),
  accountNumber: optText(30),
  ifscCode: optText(15),
  bankBranch: optText(80),
  upiId: optText(60),
  showBankOnReceipt: z.boolean().optional(),
  receiptPrefix: z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Prefix: letters, numbers and hyphen only (max 10)').optional(),
  copiesPerReceipt: z.coerce.number().int().min(1).max(2).optional(),
  showBalanceOnReceipt: z.boolean().optional(),
  termsText: optText(600),
  signatureLabel: z.string().trim().min(1).max(40).optional(),
  enabledModes: z.array(z.enum(PAYMENT_MODES)).min(1, 'Enable at least one payment mode').optional(),
  lateFeeMode: z.enum(['none', 'flat', 'per_day']).optional(),
  lateFeeAmount: z.coerce.number().min(0).max(1000000).optional(),
  lateFeeGraceDays: z.coerce.number().int().min(0).max(365).optional(),
  lateFeeMaxAmount: z.coerce.number().min(0).max(10000000).nullable().optional(),
  collectorCanConcede: z.boolean().optional(),
});

// heads + structure
const createHeadSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: optText(15),
  description: optText(200),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  sortOrder: z.coerce.number().int().optional(),
});
const updateHeadSchema = createHeadSchema.partial().extend({ isActive: z.boolean().optional() });

const createStructureSchema = z.object({
  sessionId: uuid,
  classId: uuid,
  feeHeadId: uuid,
  amount: z.coerce.number().min(0).max(10000000),
  frequency: z.enum(FREQUENCIES),
  installments: z.coerce.number().int().min(1).max(24).optional(),
  firstDueDate: dateStr,
  appliesTo: z.enum(['all', 'new', 'old']).optional(),
});
const updateStructureSchema = z.object({
  amount: z.coerce.number().min(0).max(10000000).optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  installments: z.coerce.number().int().min(1).max(24).optional(),
  firstDueDate: dateStr.optional(),
  appliesTo: z.enum(['all', 'new', 'old']).optional(),
});
const copyStructureSchema = z.object({ fromSessionId: uuid, toSessionId: uuid });
const generateSchema = z.object({ sessionId: uuid.optional(), classId: uuid.optional() });

// collection
const collectSchema = z.object({
  studentId: uuid,
  items: z.array(z.object({
    chargeId: uuid,
    amount: z.coerce.number().positive().max(10000000),
    waiveLateFee: z.boolean().optional(),
  })).min(1).max(60),
  paymentMode: z.string().min(2).max(20),
  referenceNo: optText(60),
  bankName: optText(80),
  instrumentDate: dateStr.nullable().optional(),
  paymentDate: dateStr.nullable().optional(),
  remarks: optText(300),
});
const cancelReceiptSchema = z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) });
const addChargeSchema = z.object({
  studentId: uuid,
  enrollmentId: uuid,
  feeHeadId: uuid,
  title: optText(120),
  amount: z.coerce.number().positive().max(10000000),
  dueDate: dateStr,
});
const concessionSchema = z.object({
  chargeIds: z.array(uuid).min(1).max(100),
  type: z.enum(['amount', 'percent']),
  value: z.coerce.number().min(0).max(10000000),
  reason: optText(200),
}).refine((d) => d.value === 0 || (d.reason && d.reason.length >= 3), { message: 'A reason is required for a concession', path: ['reason'] })
  .refine((d) => d.type !== 'percent' || d.value <= 100, { message: 'Percent cannot exceed 100', path: ['value'] });
const remindSchema = z.object({ studentIds: z.array(uuid).min(1).max(500) });

module.exports = {
  createFeeStaffSchema, updateFeeStaffSchema, setFeeStaffPasswordSchema, settingsSchema,
  createHeadSchema, updateHeadSchema, createStructureSchema, updateStructureSchema, copyStructureSchema, generateSchema,
  collectSchema, cancelReceiptSchema, addChargeSchema, concessionSchema, remindSchema,
};