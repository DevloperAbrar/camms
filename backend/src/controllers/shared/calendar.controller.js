const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const svc = require('../../services/calendar.service');
const { sendExport } = require('../../services/calendarExport.service');
const { exportQuerySchema } = require('../../validators/calendar.validator');

// Faculty and parents only ever see a trimmed, read-only version of the calendar
async function finishPayload({ schoolId, school, sessions, session, role, classId }) {
  const [settingsRow, events] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { sessionId: session.id } }),
    svc.fetchEvents({ schoolId, sessionId: session.id, role, classId }),
  ]);

  const categoryIds = Array.from(new Set(events.map((e) => e.categoryId)));
  const categories = categoryIds.length
    ? await prisma.calendarCategory.findMany({ where: { schoolId, id: { in: categoryIds } } })
    : [];
  const classNames = await svc.getClassNames(schoolId, events.flatMap((e) => e.classIds));

  return svc.buildPayload({
    school, sessions, session,
    settings: svc.normalizeSettings(settingsRow),
    events, categories, classes: [], classNames, role,
  });
}

async function facultyPayload(req, requestedSessionId) {
  const [school, sessions] = await Promise.all([
    prisma.school.findUnique({ where: { id: req.schoolId } }),
    prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } }),
  ]);
  const session = svc.resolveSession(sessions, requestedSessionId);
  if (!session) throw httpError(404, 'No academic session has been set up yet');
  return finishPayload({ schoolId: req.schoolId, school, sessions, session, role: 'faculty' });
}

async function parentPayload(req, requestedSessionId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: req.student.id },
    include: { session: true },
    orderBy: { session: { startDate: 'desc' } },
  });
  if (!enrollments.length) throw httpError(404, 'No enrollment found for this student');

  const sessions = enrollments.map((e) => e.session);
  const session = svc.resolveSession(sessions, requestedSessionId);
  const enrollment = enrollments.find((e) => e.sessionId === session.id);
  const school = await prisma.school.findUnique({ where: { id: req.student.schoolId } });

  return finishPayload({
    schoolId: req.student.schoolId, school, sessions, session,
    role: 'parent', classId: enrollment.classId,
  });
}

const getFacultyCalendar = asyncHandler(async (req, res) => {
  const payload = await facultyPayload(req, req.query.sessionId);
  return ApiResponse.success(res, 200, 'Calendar fetched', payload);
});

const exportFacultyCalendar = asyncHandler(async (req, res) => {
  const { format, sessionId } = exportQuerySchema.parse(req.query);
  const payload = await facultyPayload(req, sessionId);
  return sendExport(res, payload, format, 'Faculty copy');
});

const getParentCalendar = asyncHandler(async (req, res) => {
  const payload = await parentPayload(req, req.query.sessionId);
  return ApiResponse.success(res, 200, 'Calendar fetched', payload);
});

const exportParentCalendar = asyncHandler(async (req, res) => {
  const { format, sessionId } = exportQuerySchema.parse(req.query);
  const payload = await parentPayload(req, sessionId);
  return sendExport(res, payload, format, 'Parent copy');
});

module.exports = { getFacultyCalendar, exportFacultyCalendar, getParentCalendar, exportParentCalendar };