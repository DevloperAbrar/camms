const { z } = require('zod');

const markAttendanceSchema = z.object({
  sessionId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(), // null = daily attendance
  date: z.string(),
  records: z.array(
    z.object({
      enrollmentId: z.string().uuid(),
      status: z.enum(['present', 'absent', 'late']),
    })
  ).min(1),
});

const enterMarksSchema = z.object({
  examSubjectId: z.string().uuid(),
  records: z.array(
    z.object({
      enrollmentId: z.string().uuid(),
      marksObtained: z.number().nonnegative(),
    })
  ).min(1),
});

const requestCorrectionSchema = z.object({
  type: z.enum(['attendance', 'marks']),
  referenceId: z.string().uuid(),
  reason: z.string().min(5),
});

module.exports = { markAttendanceSchema, enterMarksSchema, requestCorrectionSchema };