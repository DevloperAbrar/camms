const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const svc = require('../../services/calendar.service');
const { sendExport } = require('../../services/calendarExport.service');
const {
  createEventSchema,
  updateEventSchema,
  markReviewedSchema,
  settingsSchema,
  categorySchema,
  updateCategorySchema,
  copyCalendarSchema,
  exportQuerySchema,
} = require('../../validators/calendar.validator');

async function requireSession(schoolId, sessionId) {
  const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } });
  if (!session) throw httpError(404, 'Session not found');
  return session;
}

// Shared checks for create and update
async function validateEvent(schoolId, session, { startDate, endDate, categoryId, classIds }) {
  const sStart = svc.ymd(session.startDate);
  const sEnd = svc.ymd(session.endDate);
  if (startDate < sStart || endDate > sEnd) {
    throw httpError(422, `Dates must fall within the session (${sStart} to ${sEnd})`);
  }

  const category = await prisma.calendarCategory.findFirst({ where: { id: categoryId, schoolId } });
  if (!category) throw httpError(404, 'Category not found');

  if (classIds && classIds.length) {
    const found = await prisma.class.count({ where: { id: { in: classIds }, schoolId, sessionId: session.id } });
    if (found !== classIds.length) throw httpError(422, 'One or more selected classes do not belong to this session');
  }
  return category;
}

async function loadAdminPayload(req, requestedSessionId) {
  await svc.ensureDefaultCategories(req.schoolId);

  const [school, sessions, categories] = await Promise.all([
    prisma.school.findUnique({ where: { id: req.schoolId } }),
    prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } }),
    prisma.calendarCategory.findMany({ where: { schoolId: req.schoolId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);

  const session = svc.resolveSession(sessions, requestedSessionId);
  if (!session) {
    return svc.buildPayload({
      school, sessions, session: null, settings: svc.normalizeSettings(null),
      events: [], categories, classes: [], classNames: {}, role: 'admin',
    });
  }

  const [settingsRow, events, classes] = await Promise.all([
    prisma.calendarSettings.findUnique({ where: { sessionId: session.id } }),
    svc.fetchEvents({ schoolId: req.schoolId, sessionId: session.id, role: 'admin' }),
    prisma.class.findMany({
      where: { schoolId: req.schoolId, sessionId: session.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return svc.buildPayload({
    school, sessions, session,
    settings: svc.normalizeSettings(settingsRow),
    events, categories, classes,
    classNames: Object.fromEntries(classes.map((c) => [c.id, c.name])),
    role: 'admin',
  });
}

// ---------------------------------------------------------------- read
const getCalendar = asyncHandler(async (req, res) => {
  const payload = await loadAdminPayload(req, req.query.sessionId);
  return ApiResponse.success(res, 200, 'Calendar fetched', payload);
});

const exportCalendar = asyncHandler(async (req, res) => {
  const { format, sessionId } = exportQuerySchema.parse(req.query);
  const payload = await loadAdminPayload(req, sessionId);
  if (!payload.session) return ApiResponse.error(res, 404, 'No academic session found');
  return sendExport(res, payload, format, 'School Administration');
});

// ---------------------------------------------------------------- events
const createEvent = asyncHandler(async (req, res) => {
  const data = createEventSchema.parse(req.body);
  const session = await requireSession(req.schoolId, data.sessionId);
  const endDate = data.endDate || data.startDate;

  const category = await validateEvent(req.schoolId, session, {
    startDate: data.startDate, endDate, categoryId: data.categoryId, classIds: data.classIds,
  });
  if (!category.isActive) throw httpError(422, 'This category is turned off. Pick another one.');

  const duplicate = await prisma.calendarEvent.findFirst({
    where: {
      schoolId: req.schoolId,
      sessionId: session.id,
      startDate: svc.toDate(data.startDate),
      title: { equals: data.title, mode: 'insensitive' },
    },
  });
  if (duplicate) throw httpError(409, 'An event with this title already exists on this date');

  const event = await prisma.calendarEvent.create({
    data: {
      schoolId: req.schoolId,
      sessionId: session.id,
      categoryId: category.id,
      kind: category.kind,
      title: data.title,
      description: data.description || null,
      startDate: svc.toDate(data.startDate),
      endDate: svc.toDate(endDate),
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      location: data.location || null,
      audience: data.audience,
      classIds: data.classIds,
      createdById: req.user.id,
    },
    include: { category: true },
  });

  await logAudit({ req, action: 'CREATE_CALENDAR_EVENT', resourceType: 'calendar_event', resourceId: event.id, metadata: { title: event.title } });
  return ApiResponse.success(res, 201, 'Event added', svc.serializeEvent(event));
});

const updateEvent = asyncHandler(async (req, res) => {
  const data = updateEventSchema.parse(req.body);
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Event not found');

  const session = await requireSession(req.schoolId, existing.sessionId);
  const startDate = data.startDate || svc.ymd(existing.startDate);
  let endDate = data.endDate || svc.ymd(existing.endDate);
  if (endDate < startDate) endDate = startDate;

  const categoryId = data.categoryId || existing.categoryId;
  const classIds = data.classIds || existing.classIds;
  const category = await validateEvent(req.schoolId, session, { startDate, endDate, categoryId, classIds });

  const updated = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      categoryId: category.id,
      kind: category.kind,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      startDate: svc.toDate(startDate),
      endDate: svc.toDate(endDate),
      ...(data.startTime !== undefined ? { startTime: data.startTime || null } : {}),
      ...(data.endTime !== undefined ? { endTime: data.endTime || null } : {}),
      ...(data.location !== undefined ? { location: data.location || null } : {}),
      ...(data.audience !== undefined ? { audience: data.audience } : {}),
      classIds,
      needsReview: false,
    },
    include: { category: true },
  });

  await logAudit({ req, action: 'UPDATE_CALENDAR_EVENT', resourceType: 'calendar_event', resourceId: updated.id, metadata: { title: updated.title } });
  return ApiResponse.success(res, 200, 'Event updated', svc.serializeEvent(updated));
});

const deleteEvent = asyncHandler(async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Event not found');
  await prisma.calendarEvent.delete({ where: { id: existing.id } });
  await logAudit({ req, action: 'DELETE_CALENDAR_EVENT', resourceType: 'calendar_event', resourceId: existing.id, metadata: { title: existing.title } });
  return ApiResponse.success(res, 200, 'Event deleted');
});

const markAllReviewed = asyncHandler(async (req, res) => {
  const { sessionId } = markReviewedSchema.parse(req.body);
  await requireSession(req.schoolId, sessionId);
  const result = await prisma.calendarEvent.updateMany({
    where: { schoolId: req.schoolId, sessionId, needsReview: true },
    data: { needsReview: false },
  });
  await logAudit({ req, action: 'REVIEW_CALENDAR_EVENTS', resourceType: 'academic_session', resourceId: sessionId, metadata: { count: result.count } });
  return ApiResponse.success(res, 200, 'Marked as reviewed', { count: result.count });
});

// ---------------------------------------------------------------- weekly off settings
const saveSettings = asyncHandler(async (req, res) => {
  const data = settingsSchema.parse(req.body);
  await requireSession(req.schoolId, data.sessionId);

  const weeklyOffDays = Array.from(new Set(data.weeklyOffDays)).sort();
  // A Saturday that is already fully off does not need ordinals
  const offSaturdays = weeklyOffDays.includes(6) ? [] : Array.from(new Set(data.offSaturdays)).sort();

  const settings = await prisma.calendarSettings.upsert({
    where: { sessionId: data.sessionId },
    create: { schoolId: req.schoolId, sessionId: data.sessionId, weeklyOffDays, offSaturdays },
    update: { weeklyOffDays, offSaturdays },
  });

  await logAudit({ req, action: 'UPDATE_CALENDAR_SETTINGS', resourceType: 'academic_session', resourceId: data.sessionId, metadata: { weeklyOffDays, offSaturdays } });
  return ApiResponse.success(res, 200, 'Settings saved', svc.normalizeSettings(settings));
});

// ---------------------------------------------------------------- categories
const createCategory = asyncHandler(async (req, res) => {
  const data = categorySchema.parse(req.body);
  const last = await prisma.calendarCategory.findFirst({ where: { schoolId: req.schoolId }, orderBy: { sortOrder: 'desc' } });
  const category = await prisma.calendarCategory.create({
    data: { schoolId: req.schoolId, name: data.name, kind: data.kind, color: data.color, sortOrder: data.sortOrder ?? (last ? last.sortOrder + 1 : 0) },
  });
  await logAudit({ req, action: 'CREATE_CALENDAR_CATEGORY', resourceType: 'calendar_category', resourceId: category.id, metadata: { name: category.name } });
  return ApiResponse.success(res, 201, 'Category added', category);
});

const updateCategory = asyncHandler(async (req, res) => {
  const data = updateCategorySchema.parse(req.body);
  const existing = await prisma.calendarCategory.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Category not found');

  const updated = await prisma.$transaction(async (tx) => {
    const category = await tx.calendarCategory.update({ where: { id: existing.id }, data });
    // Events keep a copy of the kind, so keep it in sync when the category type changes
    if (data.kind && data.kind !== existing.kind) {
      await tx.calendarEvent.updateMany({ where: { categoryId: existing.id }, data: { kind: data.kind } });
    }
    return category;
  });

  await logAudit({ req, action: 'UPDATE_CALENDAR_CATEGORY', resourceType: 'calendar_category', resourceId: updated.id, metadata: data });
  return ApiResponse.success(res, 200, 'Category updated', updated);
});

const deleteCategory = asyncHandler(async (req, res) => {
  const existing = await prisma.calendarCategory.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Category not found');

  const inUse = await prisma.calendarEvent.count({ where: { categoryId: existing.id } });
  if (inUse > 0) {
    return ApiResponse.error(res, 409, `${inUse} event(s) use this category. Turn the category off instead of deleting it.`);
  }

  await prisma.calendarCategory.delete({ where: { id: existing.id } });
  await logAudit({ req, action: 'DELETE_CALENDAR_CATEGORY', resourceType: 'calendar_category', resourceId: existing.id, metadata: { name: existing.name } });
  return ApiResponse.success(res, 200, 'Category deleted');
});

// ---------------------------------------------------------------- copy from another session
const copyCalendar = asyncHandler(async (req, res) => {
  const data = copyCalendarSchema.parse(req.body);
  if (data.sourceSessionId === data.targetSessionId) {
    throw httpError(422, 'Source and target session must be different');
  }

  const [source, target] = await Promise.all([
    requireSession(req.schoolId, data.sourceSessionId),
    requireSession(req.schoolId, data.targetSessionId),
  ]);

  const [sourceRows, sourceClasses, targetClasses, existing] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { schoolId: req.schoolId, sessionId: source.id }, include: { category: true }, orderBy: { startDate: 'asc' } }),
    prisma.class.findMany({ where: { schoolId: req.schoolId, sessionId: source.id }, select: { id: true, name: true } }),
    prisma.class.findMany({ where: { schoolId: req.schoolId, sessionId: target.id }, select: { id: true, name: true } }),
    prisma.calendarEvent.findMany({ where: { schoolId: req.schoolId, sessionId: target.id }, select: { title: true, startDate: true } }),
  ]);

  const plan = svc.planCopy({
    sourceSession: source,
    targetSession: target,
    sourceEvents: sourceRows.map(svc.serializeEvent),
    sourceClasses,
    targetClasses,
    existing: existing.map((e) => ({ title: e.title, startDate: svc.ymd(e.startDate) })),
    mode: data.mode,
    kinds: data.kinds,
  });

  if (data.dryRun) return ApiResponse.success(res, 200, 'Preview ready', { summary: plan.summary });

  await prisma.$transaction(async (tx) => {
    if (plan.toCreate.length) {
      await tx.calendarEvent.createMany({
        data: plan.toCreate.map((e) => ({
          schoolId: req.schoolId,
          sessionId: target.id,
          categoryId: e.categoryId,
          kind: e.kind,
          title: e.title,
          description: e.description,
          startDate: svc.toDate(e.startDate),
          endDate: svc.toDate(e.endDate),
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          audience: e.audience,
          classIds: e.classIds,
          needsReview: true,
          createdById: req.user.id,
        })),
      });
    }

    if (data.copySettings) {
      const s = await tx.calendarSettings.findUnique({ where: { sessionId: source.id } });
      if (s) {
        await tx.calendarSettings.upsert({
          where: { sessionId: target.id },
          create: { schoolId: req.schoolId, sessionId: target.id, weeklyOffDays: s.weeklyOffDays, offSaturdays: s.offSaturdays },
          update: { weeklyOffDays: s.weeklyOffDays, offSaturdays: s.offSaturdays },
        });
      }
    }
  });

  await logAudit({
    req, action: 'COPY_CALENDAR', resourceType: 'academic_session', resourceId: target.id,
    metadata: { from: source.id, mode: data.mode, ...plan.summary },
  });
  return ApiResponse.success(res, 200, 'Calendar copied', { summary: plan.summary });
});

module.exports = {
  getCalendar,
  exportCalendar,
  createEvent,
  updateEvent,
  deleteEvent,
  markAllReviewed,
  saveSettings,
  createCategory,
  updateCategory,
  deleteCategory,
  copyCalendar,
};