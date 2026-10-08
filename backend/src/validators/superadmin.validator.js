const { z } = require('zod');

// Optional password typed by the super admin. Blank / missing = auto-generate on the server.
const optionalAdminPassword = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long (max 72 bytes)')
    .refine((v) => v.trim().length > 0, 'Password cannot be only spaces')
    .optional()
);

const createSchoolSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20).regex(/^[a-zA-Z0-9-]+$/, 'Code can only contain letters, numbers, and hyphens'),
  address: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  planId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  adminPassword: optionalAdminPassword,
});

const resetAdminPasswordSchema = z.object({
  password: optionalAdminPassword,
});

const updateSchoolSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  logoUrl: z.string().url().optional(),
  timezone: z.string().optional(),
});

const suspendSchoolSchema = z.object({
  reason: z.string().min(3),
});

const createPlanSchema = z.object({
  name: z.string().min(2),
  maxStudents: z.number().int().positive(),
  maxFaculty: z.number().int().positive(),
  maxClasses: z.number().int().positive(),
  features: z.record(z.boolean()).default({}),
  price: z.number().positive(),
  billingCycle: z.enum(['monthly', 'yearly']),
});

const updatePlanSchema = createPlanSchema.partial();

const renewSubscriptionSchema = z.object({
  amount: z.number().positive(),
  invoiceRef: z.string().optional(),
  paymentMode: z.string().optional(),
  extendMonths: z.number().int().positive().optional(),
  newEndDate: z.string().optional(),
});

const changePlanSchema = z.object({
  planId: z.string().uuid(),
});

module.exports = {
  createSchoolSchema,
  resetAdminPasswordSchema,
  updateSchoolSchema,
  suspendSchoolSchema,
  createPlanSchema,
  updatePlanSchema,
  renewSubscriptionSchema,
  changePlanSchema,
};