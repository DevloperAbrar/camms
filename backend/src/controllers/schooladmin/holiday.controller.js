const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createHolidaySchema } = require('../../validators/exam.validator');
const svc = require('../../services/calendar.service');

const createHoliday = asyncHandler(async (req, res) => {
  const data = createHolidaySchema.parse(req.body);

  const session = await prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId: req.schoolId } });
  if (!session) return ApiResponse.error(res, 404, 'Session not found');

  const when = new Date(data.date);
  if (Number.isNaN(when.getTime())) return ApiResponse.error(res, 422, 'Invalid date');
  const day = svc.ymd(when);

  await svc.ensureDefaultCategories(req.schoolId);
  const category = await prisma.calendarCategory.findFirst({
    where: { schoolId: req.schoolId, kind: 'holiday', isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (!category) return ApiResponse.error(res, 422, 'No holiday category available');

  const event = await prisma.calendarEvent.create({
    data: {
      schoolId: req.schoolId,
      sessionId: session.id,
      categoryId: category.id,
      kind: 'holiday',
      title: (data.description || '').trim() || 'Holiday',
      startDate: svc.toDate(day),
      endDate: svc.toDate(day),
      createdById: req.user.id,
    },
  });

  await logAudit({ req, action: 'CREATE_HOLIDAY', resourceType: 'calendar_event', resourceId: event.id });
  return ApiResponse.success(res, 201, 'Holiday added', {
    id: event.id, sessionId: event.sessionId, date: event.startDate, description: event.title,
  });
});

// Returns one row per holiday day, same shape as before
const getHolidays = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  const events = await prisma.calendarEvent.findMany({
    where: { schoolId: req.schoolId, kind: 'holiday', ...(sessionId ? { sessionId } : {}) },
    orderBy: { startDate: 'asc' },
  });

  const rows = [];
  for (const e of events) {
    for (const d of svc.eachDay(svc.ymd(e.startDate), svc.ymd(e.endDate))) {
      rows.push({ id: e.id, sessionId: e.sessionId, date: svc.toDate(d), description: e.title });
    }
  }
  return ApiResponse.success(res, 200, 'Holidays fetched', rows);
});

const deleteHoliday = asyncHandler(async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId, kind: 'holiday' },
  });
  if (!existing) return ApiResponse.error(res, 404, 'Holiday not found');

  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  await logAudit({ req, action: 'DELETE_HOLIDAY', resourceType: 'calendar_event', resourceId: existing.id });
  return ApiResponse.success(res, 200, 'Holiday deleted');
});

module.exports = { createHoliday, getHolidays, deleteHoliday };