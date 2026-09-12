const { z } = require('zod');

const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const facultyPasswordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

module.exports = {
  superAdminLoginSchema,
  facultyPasswordLoginSchema,
};