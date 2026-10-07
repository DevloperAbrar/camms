const { stringify } = require('csv-stringify/sync');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const cal = require('../../services/calendar.service');
const svc = require('../../services/syllabus.service');
const v = require('../../validators/syllabus.validator');

// ---------------------------------------------------------------- helpers
async function requireSession(schoolId, sessionId) {
  const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } });
  if (!session) throw httpError(404, 'Session not found');
  return session;
}

async function requireClassSubject(schoolId, sessionId, classId, subjectId) {
  const [cls, subject] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId, sessionId } }),
    prisma.subject.findFirst({ where: { id: subjectId, schoolId, sessionId, classId } }),
  ]);
  if (!cls) throw httpError(404, 'Class not found in this session');
  if (!subject) throw httpError(404, 'Subject not found in this class');
  return { cls, subject };
}

async function resolveSessionId(req) {
  if (req.query.sessionId) {
    await requireSession(req.schoolId, req.query.sessionId);
    return req.query.sessionId;
  }
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });
  const s = cal.resolveSession(sessions, null);
  if (!s) throw httpError(404, 'No academic session has been set up yet');
  return s.id;
}

async function nextSortOrder(schoolId, sessionId, subjectId) {
  const last = await prisma.syllabusChapter.findFirst({ where: { schoolId, sessionId, subjectId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  return last ? last.sortOrder + 1 : 0;
}

const serializeChapter = (c) => ({
  id: c.id,
  classId: c.classId,
  subjectId: c.subjectId,
  unitName: c.unitName,
  title: c.title,
  sortOrder: c.sortOrder,
  plannedPeriods: c.plannedPeriods,
  plannedStart: svc.ymdOrNull(c.plannedStart),
  plannedEnd: svc.ymdOrNull(c.plannedEnd),
  progressCount: c._count ? c._count.progress : 0,
  exams: (c.examScopes || []).map((s) => ({ id: s.examType.id, name: s.examType.name })),
});

// ---------------------------------------------------------------- structure (pickers)
const getStructure = asyncHandler(async (req, res) => {
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });
  const session = cal.resolveSession(sessions, req.query.sessionId);
  if (!session) {
    return ApiResponse.success(res, 200, 'Structure fetched', { sessions: [], session: null, classes: [], examTypes: [] });
  }
  const [classes, examTypes] = await Promise.all([
    svc.loadStructure({ schoolId: req.schoolId, sessionId: session.id }),
    prisma.examType.findMany({
      where: { schoolId: req.schoolId, sessionId: session.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, classId: true },
    }),
  ]);
  return ApiResponse.success(res, 200, 'Structure fetched', {
    sessions: sessions.map(cal.sessionDto),
    session: cal.sessionDto(session),
    classes,
    examTypes,
  });
});

// ---------------------------------------------------------------- chapters
const listChapters = asyncHandler(async (req, res) => {
  const { classId, subjectId } = req.query;
  if (!classId || !subjectId) return ApiResponse.error(res, 422, 'classId and subjectId are required');
  const sessionId = await resolveSessionId(req);
  await requireClassSubject(req.schoolId, sessionId, classId, subjectId);

  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId, classId, subjectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { progress: { where: { percentDone: { gt: 0 } } } } },
      examScopes: { select: { examType: { select: { id: true, name: true } } } },
    },
  });
  return ApiResponse.success(res, 200, 'Chapters fetched', chapters.map(serializeChapter));
});

const createChapter = asyncHandler(async (req, res) => {
  const data = v.createChapterSchema.parse(req.body);
  await requireClassSubject(req.schoolId, data.sessionId, data.classId, data.subjectId);

  const dup = await prisma.syllabusChapter.findFirst({
    where: { schoolId: req.schoolId, sessionId: data.sessionId, subjectId: data.subjectId, title: { equals: data.title, mode: 'insensitive' } },
  });
  if (dup) throw httpError(409, 'A chapter with this name already exists in this subject');

  const chapter = await prisma.syllabusChapter.create({
    data: {
      schoolId: req.schoolId,
      sessionId: data.sessionId,
      classId: data.classId,
      subjectId: data.subjectId,
      title: data.title,
      unitName: data.unitName || null,
      plannedPeriods: data.plannedPeriods,
      plannedStart: svc.dateOrNull(data.plannedStart),
      plannedEnd: svc.dateOrNull(data.plannedEnd),
      sortOrder: data.sortOrder ?? (await nextSortOrder(req.schoolId, data.sessionId, data.subjectId)),
    },
  });
  await logAudit({ req, action: 'CREATE_SYLLABUS_CHAPTER', resourceType: 'syllabus_chapter', resourceId: chapter.id, metadata: { title: chapter.title } });
  return ApiResponse.success(res, 201, 'Chapter added', serializeChapter(chapter));
});

const bulkCreateChapters = asyncHandler(async (req, res) => {
  const data = v.bulkChaptersSchema.parse(req.body);
  await requireClassSubject(req.schoolId, data.sessionId, data.classId, data.subjectId);

  const existing = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId: data.sessionId, subjectId: data.subjectId },
    select: { title: true, sortOrder: true },
  });
  const seen = new Set(existing.map((e) => e.title.trim().toLowerCase()));
  let order = existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0);

  const rows = [];
  let skipped = 0;
  for (const c of data.chapters) {
    const key = c.title.toLowerCase();
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    rows.push({
      schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId, subjectId: data.subjectId,
      title: c.title, unitName: c.unitName || null, plannedPeriods: c.plannedPeriods, sortOrder: order,
    });
    order += 1;
  }
  if (rows.length) await prisma.syllabusChapter.createMany({ data: rows });

  await logAudit({ req, action: 'BULK_CREATE_SYLLABUS_CHAPTERS', resourceType: 'subject', resourceId: data.subjectId, metadata: { added: rows.length, skipped } });
  return ApiResponse.success(res, 201, `${rows.length} chapter(s) added${skipped ? `, ${skipped} duplicate(s) skipped` : ''}`, { added: rows.length, skipped });
});

const updateChapter = asyncHandler(async (req, res) => {
  const data = v.updateChapterSchema.parse(req.body);
  const existing = await prisma.syllabusChapter.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Chapter not found');

  const start = data.plannedStart !== undefined ? data.plannedStart : svc.ymdOrNull(existing.plannedStart);
  const end = data.plannedEnd !== undefined ? data.plannedEnd : svc.ymdOrNull(existing.plannedEnd);
  if (start && end && end < start) throw httpError(422, 'Planned end cannot be before planned start');

  if (data.title && data.title.toLowerCase() !== existing.title.toLowerCase()) {
    const dup = await prisma.syllabusChapter.findFirst({
      where: { schoolId: req.schoolId, sessionId: existing.sessionId, subjectId: existing.subjectId, id: { not: existing.id }, title: { equals: data.title, mode: 'insensitive' } },
    });
    if (dup) throw httpError(409, 'A chapter with this name already exists in this subject');
  }

  const updated = await prisma.syllabusChapter.update({
    where: { id: existing.id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.unitName !== undefined ? { unitName: data.unitName || null } : {}),
      ...(data.plannedPeriods !== undefined ? { plannedPeriods: data.plannedPeriods } : {}),
      ...(data.plannedStart !== undefined ? { plannedStart: svc.dateOrNull(data.plannedStart) } : {}),
      ...(data.plannedEnd !== undefined ? { plannedEnd: svc.dateOrNull(data.plannedEnd) } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });
  await logAudit({ req, action: 'UPDATE_SYLLABUS_CHAPTER', resourceType: 'syllabus_chapter', resourceId: updated.id, metadata: { title: updated.title } });
  return ApiResponse.success(res, 200, 'Chapter updated', serializeChapter(updated));
});

const deleteChapter = asyncHandler(async (req, res) => {
  const existing = await prisma.syllabusChapter.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!existing) return ApiResponse.error(res, 404, 'Chapter not found');

  const withProgress = await prisma.syllabusProgress.count({ where: { chapterId: existing.id, percentDone: { gt: 0 } } });
  if (withProgress > 0 && req.query.force !== 'true') {
    return ApiResponse.error(res, 409, `${withProgress} section(s) already have progress recorded on this chapter. Confirm to delete it anyway.`);
  }
  await prisma.syllabusChapter.delete({ where: { id: existing.id } });
  await logAudit({ req, action: 'DELETE_SYLLABUS_CHAPTER', resourceType: 'syllabus_chapter', resourceId: existing.id, metadata: { title: existing.title, progressRows: withProgress } });
  return ApiResponse.success(res, 200, 'Chapter deleted');
});

// ---------------------------------------------------------------- template library
const listTemplates = asyncHandler(async (req, res) => {
  await svc.ensureStarterTemplates();
  const { className, subjectName } = req.query;
  const rows = await prisma.syllabusTemplate.findMany({
    where: { OR: [{ schoolId: null }, { schoolId: req.schoolId }] },
    orderBy: [{ isBuiltIn: 'desc' }, { board: 'asc' }, { className: 'asc' }, { subjectName: 'asc' }],
  });
  const data = rows
    .map((t) => {
      const chapters = svc.cleanTemplateChapters(t.chapters);
      return {
        id: t.id,
        board: t.board,
        className: t.className,
        subjectName: t.subjectName,
        isBuiltIn: t.isBuiltIn,
        chapterCount: chapters.length,
        chapters,
        matchScore: svc.templateMatchScore(t, className, subjectName),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
  return ApiResponse.success(res, 200, 'Templates fetched', data);
});

const applyTemplate = asyncHandler(async (req, res) => {
  const data = v.applyTemplateSchema.parse(req.body);
  await requireClassSubject(req.schoolId, data.sessionId, data.classId, data.subjectId);

  const template = await prisma.syllabusTemplate.findFirst({
    where: { id: data.templateId, OR: [{ schoolId: null }, { schoolId: req.schoolId }] },
  });
  if (!template) return ApiResponse.error(res, 404, 'Template not found');

  const chapters = svc.cleanTemplateChapters(template.chapters);
  const existing = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId: data.sessionId, subjectId: data.subjectId },
    select: { title: true, sortOrder: true },
  });
  const seen = new Set(existing.map((e) => e.title.trim().toLowerCase()));
  let order = existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0);

  const rows = [];
  for (const c of chapters) {
    if (seen.has(c.title.toLowerCase())) continue;
    seen.add(c.title.toLowerCase());
    rows.push({
      schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId, subjectId: data.subjectId,
      title: c.title, unitName: c.unitName, plannedPeriods: c.periods, sortOrder: order,
    });
    order += 1;
  }
  if (rows.length) await prisma.syllabusChapter.createMany({ data: rows });

  await logAudit({ req, action: 'APPLY_SYLLABUS_TEMPLATE', resourceType: 'subject', resourceId: data.subjectId, metadata: { templateId: template.id, added: rows.length } });
  const skipped = chapters.length - rows.length;
  return ApiResponse.success(res, 200, `${rows.length} chapter(s) added${skipped ? `, ${skipped} already existed` : ''}`, { added: rows.length, skipped });
});

const saveTemplate = asyncHandler(async (req, res) => {
  const data = v.saveTemplateSchema.parse(req.body);
  const { cls, subject } = await requireClassSubject(req.schoolId, data.sessionId, data.classId, data.subjectId);

  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId: data.sessionId, subjectId: data.subjectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!chapters.length) throw httpError(422, 'Add some chapters first, then save them as a template');

  const payload = chapters.map((c) => ({ title: c.title, unitName: c.unitName, periods: c.plannedPeriods }));
  const existing = await prisma.syllabusTemplate.findFirst({
    where: { schoolId: req.schoolId, board: { equals: data.board, mode: 'insensitive' }, className: cls.name, subjectName: subject.name },
  });
  const template = existing
    ? await prisma.syllabusTemplate.update({ where: { id: existing.id }, data: { chapters: payload } })
    : await prisma.syllabusTemplate.create({
        data: { schoolId: req.schoolId, board: data.board, className: cls.name, subjectName: subject.name, chapters: payload, createdById: req.user.id },
      });

  await logAudit({ req, action: 'SAVE_SYLLABUS_TEMPLATE', resourceType: 'syllabus_template', resourceId: template.id, metadata: { board: data.board, chapters: payload.length } });
  return ApiResponse.success(res, existing ? 200 : 201, existing ? 'Template updated' : 'Template saved', { id: template.id });
});

const deleteTemplate = asyncHandler(async (req, res) => {
  const t = await prisma.syllabusTemplate.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!t) return ApiResponse.error(res, 404, 'Template not found (built-in templates cannot be deleted)');
  await prisma.syllabusTemplate.delete({ where: { id: t.id } });
  await logAudit({ req, action: 'DELETE_SYLLABUS_TEMPLATE', resourceType: 'syllabus_template', resourceId: t.id });
  return ApiResponse.success(res, 200, 'Template deleted');
});

// ---------------------------------------------------------------- CSV import
const getCsvTemplate = asyncHandler(async (req, res) => {
  const sessionId = await resolveSessionId(req);
  const classes = await svc.loadStructure({ schoolId: req.schoolId, sessionId });
  const cls = classes.find((c) => c.subjects.length) || { name: 'Class 8', subjects: [{ name: 'Mathematics' }] };
  const sub = cls.subjects[0];
  const csv = stringify([
    ['class', 'subject', 'unit', 'chapter', 'periods'],
    [cls.name, sub.name, 'Unit 1', 'Rational Numbers', 8],
    [cls.name, sub.name, 'Unit 1', 'Linear Equations in One Variable', 10],
  ]);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="syllabus-template.csv"');
  return res.send(csv);
});

const importCsv = asyncHandler(async (req, res) => {
  const data = v.csvImportSchema.parse(req.body);
  if (!req.file) throw httpError(422, 'Please attach a CSV file');
  await requireSession(req.schoolId, data.sessionId);

  const rows = svc.parseSyllabusCsv(req.file.buffer);
  if (rows.length > 3000) throw httpError(422, 'Please import at most 3000 rows at a time');

  const [classes, existing] = await Promise.all([
    svc.loadStructure({ schoolId: req.schoolId, sessionId: data.sessionId }),
    prisma.syllabusChapter.findMany({
      where: { schoolId: req.schoolId, sessionId: data.sessionId },
      select: { subjectId: true, title: true, sortOrder: true },
    }),
  ]);
  const plan = svc.planCsvImport({ rows, classes, existing });

  if (data.dryRun === 'true') {
    return ApiResponse.success(res, 200, 'Preview ready', {
      summary: plan.summary,
      errors: plan.errors.slice(0, 100),
      sample: plan.toCreate.slice(0, 15).map((r) => ({ title: r.title, unitName: r.unitName, plannedPeriods: r.plannedPeriods })),
    });
  }
  if (plan.errors.length) throw httpError(422, `Fix the ${plan.errors.length} problem row(s) and upload again. Nothing was imported.`);

  if (plan.toCreate.length) {
    await prisma.syllabusChapter.createMany({
      data: plan.toCreate.map((r) => ({ schoolId: req.schoolId, sessionId: data.sessionId, ...r })),
    });
  }
  await logAudit({ req, action: 'IMPORT_SYLLABUS_CSV', resourceType: 'academic_session', resourceId: data.sessionId, metadata: plan.summary });
  return ApiResponse.success(res, 201, `${plan.toCreate.length} chapter(s) imported`, { summary: plan.summary });
});

// ---------------------------------------------------------------- copy from previous session
const copySyllabus = asyncHandler(async (req, res) => {
  const data = v.copySyllabusSchema.parse(req.body);
  if (data.fromSessionId === data.toSessionId) throw httpError(422, 'Source and target session must be different');
  await Promise.all([requireSession(req.schoolId, data.fromSessionId), requireSession(req.schoolId, data.toSessionId)]);

  const [sourceChapters, sourceClasses, targetClasses, existing] = await Promise.all([
    prisma.syllabusChapter.findMany({ where: { schoolId: req.schoolId, sessionId: data.fromSessionId }, orderBy: [{ sortOrder: 'asc' }] }),
    svc.loadStructure({ schoolId: req.schoolId, sessionId: data.fromSessionId }),
    svc.loadStructure({ schoolId: req.schoolId, sessionId: data.toSessionId }),
    prisma.syllabusChapter.findMany({ where: { schoolId: req.schoolId, sessionId: data.toSessionId }, select: { subjectId: true, title: true } }),
  ]);
  const plan = svc.planSyllabusCopy({ sourceChapters, sourceClasses, targetClasses, existing });

  if (data.dryRun) return ApiResponse.success(res, 200, 'Preview ready', { summary: plan.summary });

  if (plan.toCreate.length) {
    await prisma.syllabusChapter.createMany({
      data: plan.toCreate.map((r) => ({ schoolId: req.schoolId, sessionId: data.toSessionId, ...r })),
    });
  }
  await logAudit({ req, action: 'COPY_SYLLABUS', resourceType: 'academic_session', resourceId: data.toSessionId, metadata: { from: data.fromSessionId, ...plan.summary } });
  return ApiResponse.success(res, 200, 'Syllabus copied. Progress and dates start fresh.', { summary: plan.summary });
});

// ---------------------------------------------------------------- calendar-aware auto schedule
const autoSchedule = asyncHandler(async (req, res) => {
  const data = v.scheduleSchema.parse(req.body);
  const session = await requireSession(req.schoolId, data.sessionId);
  const cls = await prisma.class.findFirst({ where: { id: data.classId, schoolId: req.schoolId, sessionId: session.id } });
  if (!cls) throw httpError(404, 'Class not found in this session');
  if (data.startDate < cal.ymd(session.startDate) || data.endDate > cal.ymd(session.endDate)) {
    throw httpError(422, `Dates must fall within the session (${cal.ymd(session.startDate)} to ${cal.ymd(session.endDate)})`);
  }

  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId: session.id, classId: cls.id, ...(data.subjectId ? { subjectId: data.subjectId } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!chapters.length) throw httpError(422, 'No chapters to schedule yet');

  const days = await svc.workingDayList({ schoolId: req.schoolId, sessionId: session.id, classId: cls.id, start: data.startDate, end: data.endDate });
  if (!days.length) throw httpError(422, 'There are no working days in this date range');

  const bySubject = new Map();
  for (const c of chapters) {
    if (!bySubject.has(c.subjectId)) bySubject.set(c.subjectId, []);
    bySubject.get(c.subjectId).push(c);
  }
  const plan = [];
  for (const list of bySubject.values()) plan.push(...svc.distributeChapters(list, days));

  await prisma.$transaction(
    plan.map((p) => prisma.syllabusChapter.update({ where: { id: p.id }, data: { plannedStart: cal.toDate(p.plannedStart), plannedEnd: cal.toDate(p.plannedEnd) } })),
  );
  await logAudit({ req, action: 'AUTO_SCHEDULE_SYLLABUS', resourceType: 'class', resourceId: cls.id, metadata: { chapters: plan.length, workingDays: days.length, from: data.startDate, to: data.endDate } });
  return ApiResponse.success(res, 200, `${plan.length} chapter(s) scheduled across ${days.length} working days`, { scheduled: plan.length, workingDays: days.length });
});

// ---------------------------------------------------------------- exam scope ("what does Half Yearly cover?")
const getExamScope = asyncHandler(async (req, res) => {
  const { examTypeId } = req.query;
  if (!examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');
  const examType = await prisma.examType.findFirst({
    where: { id: examTypeId, schoolId: req.schoolId },
    include: { class: { select: { id: true, name: true } }, examSubjects: { select: { subjectId: true } } },
  });
  if (!examType) return ApiResponse.error(res, 404, 'Exam not found');

  const [subjects, chapters, scopes] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId: req.schoolId, classId: examType.classId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.syllabusChapter.findMany({
      where: { schoolId: req.schoolId, sessionId: examType.sessionId, classId: examType.classId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.syllabusExamScope.findMany({ where: { schoolId: req.schoolId, examTypeId }, select: { chapterId: true } }),
  ]);
  const selected = new Set(scopes.map((s) => s.chapterId));
  const inExam = new Set(examType.examSubjects.map((e) => e.subjectId));

  return ApiResponse.success(res, 200, 'Exam scope fetched', {
    exam: { id: examType.id, name: examType.name, classId: examType.classId, className: examType.class.name },
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      inExam: inExam.has(s.id),
      chapters: chapters
        .filter((c) => c.subjectId === s.id)
        .map((c) => ({ id: c.id, title: c.title, unitName: c.unitName, sortOrder: c.sortOrder, selected: selected.has(c.id) })),
    })),
  });
});

const saveExamScope = asyncHandler(async (req, res) => {
  const data = v.examScopeSchema.parse(req.body);
  const examType = await prisma.examType.findFirst({ where: { id: data.examTypeId, schoolId: req.schoolId } });
  if (!examType) return ApiResponse.error(res, 404, 'Exam not found');
  const subject = await prisma.subject.findFirst({ where: { id: data.subjectId, schoolId: req.schoolId, classId: examType.classId } });
  if (!subject) throw httpError(422, "This subject does not belong to the exam's class");

  const ids = [...new Set(data.chapterIds)];
  const valid = await prisma.syllabusChapter.count({
    where: { id: { in: ids }, schoolId: req.schoolId, sessionId: examType.sessionId, classId: examType.classId, subjectId: subject.id },
  });
  if (valid !== ids.length) throw httpError(422, 'One or more chapters do not belong to this subject');

  await prisma.$transaction([
    prisma.syllabusExamScope.deleteMany({ where: { schoolId: req.schoolId, examTypeId: examType.id, chapter: { subjectId: subject.id } } }),
    ...(ids.length ? [prisma.syllabusExamScope.createMany({ data: ids.map((chapterId) => ({ schoolId: req.schoolId, examTypeId: examType.id, chapterId })) })] : []),
  ]);
  await logAudit({ req, action: 'SAVE_SYLLABUS_EXAM_SCOPE', resourceType: 'exam_type', resourceId: examType.id, metadata: { subject: subject.name, chapters: ids.length } });
  return ApiResponse.success(res, 200, 'Exam syllabus saved', { chapters: ids.length });
});

// ---------------------------------------------------------------- monitoring
const getOverview = asyncHandler(async (req, res) => {
  const sessionId = await resolveSessionId(req);
  const today = await svc.getToday(req.schoolId);
  const classes = await svc.loadStructure({ schoolId: req.schoolId, sessionId, classId: req.query.classId || null });
  const rows = await svc.computeRows({ schoolId: req.schoolId, sessionId, combos: svc.allCombos(classes), today });
  return ApiResponse.success(res, 200, 'Overview fetched', { sessionId, today, rows, summary: svc.overviewSummary(rows) });
});

const getExamReadiness = asyncHandler(async (req, res) => {
  if (!req.query.examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');
  const today = await svc.getToday(req.schoolId);
  const result = await svc.buildReadiness({ schoolId: req.schoolId, examTypeId: req.query.examTypeId, today });
  if (!result) return ApiResponse.error(res, 404, 'Exam not found');
  return ApiResponse.success(res, 200, 'Exam readiness fetched', { today, ...result });
});

// Admin can update progress for any section (e.g. when a teacher is on leave)
const saveProgress = asyncHandler(async (req, res) => {
  const data = v.saveProgressSchema.parse(req.body);
  await requireSession(req.schoolId, data.sessionId);
  await svc.assertProgressTarget({
    schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId, sectionId: data.sectionId, subjectId: data.subjectId,
    chapterIds: data.updates.map((u) => u.chapterId),
  });
  const today = await svc.getToday(req.schoolId);
  const count = await svc.saveProgress({ schoolId: req.schoolId, userId: req.user.id, sectionId: data.sectionId, updates: data.updates, today });
  await logAudit({ req, action: 'ADMIN_UPDATE_SYLLABUS_PROGRESS', resourceType: 'section', resourceId: data.sectionId, metadata: { subjectId: data.subjectId, count } });
  return ApiResponse.success(res, 200, 'Progress saved', { count });
});

const getSectionTracker = asyncHandler(async (req, res) => {
  const { classId, sectionId, subjectId } = req.query;
  if (!classId || !sectionId || !subjectId) return ApiResponse.error(res, 422, 'classId, sectionId and subjectId are required');
  const sessionId = await resolveSessionId(req);
  await svc.assertProgressTarget({ schoolId: req.schoolId, sessionId, classId, sectionId, subjectId, chapterIds: [] });

  const today = await svc.getToday(req.schoolId);
  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId, classId, subjectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { examScopes: { select: { examType: { select: { id: true, name: true } } } } },
  });
  const progress = await prisma.syllabusProgress.findMany({ where: { schoolId: req.schoolId, sectionId, chapterId: { in: chapters.map((c) => c.id) } } });
  const pmap = new Map(progress.map((p) => [p.chapterId, p]));

  return ApiResponse.success(res, 200, 'Tracker fetched', {
    today,
    summary: svc.summarise(chapters, (id) => pmap.get(id), today),
    chapters: chapters.map((c) => {
      const p = pmap.get(c.id);
      const ef = svc.expectedFraction(c, today);
      return {
        id: c.id, title: c.title, unitName: c.unitName, sortOrder: c.sortOrder, plannedPeriods: c.plannedPeriods,
        plannedStart: svc.ymdOrNull(c.plannedStart), plannedEnd: svc.ymdOrNull(c.plannedEnd),
        expectedPct: ef === null ? null : Math.round(ef * 100),
        status: p ? p.status : 'not_started',
        percentDone: p ? p.percentDone : 0,
        isRevised: p ? p.isRevised : false,
        remarks: p ? p.remarks : null,
        completedOn: p ? svc.ymdOrNull(p.completedOn) : null,
        updatedAt: p ? p.updatedAt : null,
        exams: c.examScopes.map((s) => s.examType.name),
      };
    }),
  });
});

// One-click nudge to the teacher(s) of a lagging section. One reminder per teacher per day.
const sendReminder = asyncHandler(async (req, res) => {
  const data = v.reminderSchema.parse(req.body);
  await requireSession(req.schoolId, data.sessionId);

  const assignments = await prisma.facultyAssignment.findMany({
    where: { sessionId: data.sessionId, sectionId: data.sectionId, subjectId: data.subjectId, isActive: true, faculty: { schoolId: req.schoolId } },
    select: {
      facultyId: true,
      class: { select: { name: true } },
      section: { select: { name: true } },
      subject: { select: { name: true } },
    },
  });
  if (!assignments.length) throw httpError(422, 'No teacher is assigned to this subject in this section');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let sent = 0;
  for (const a of assignments) {
    const already = await prisma.notification.findFirst({
      where: { recipientRef: a.facultyId, type: 'syllabus_reminder', createdAt: { gte: since }, message: { contains: `${a.section.name} - ${a.subject.name}` } },
    });
    if (already) continue;
    await prisma.notification.create({
      data: {
        schoolId: req.schoolId,
        recipientType: 'faculty',
        recipientRef: a.facultyId,
        title: 'Syllabus progress update needed',
        message: `Please update the syllabus progress for ${a.class.name} ${a.section.name} - ${a.subject.name}.${data.note ? ` Note from admin: ${data.note}` : ''}`,
        type: 'syllabus_reminder',
      },
    });
    sent += 1;
  }
  if (!sent) throw httpError(409, 'A reminder was already sent to this teacher today');
  await logAudit({ req, action: 'SEND_SYLLABUS_REMINDER', resourceType: 'section', resourceId: data.sectionId, metadata: { subjectId: data.subjectId, sent } });
  return ApiResponse.success(res, 200, `Reminder sent to ${sent} teacher(s)`, { sent });
});

// CSV export: overview (default) or exam readiness when examTypeId is given
const exportCsv = asyncHandler(async (req, res) => {
  const today = await svc.getToday(req.schoolId);
  let header; let lines; let name;

  if (req.query.examTypeId) {
    const r = await svc.buildReadiness({ schoolId: req.schoolId, examTypeId: req.query.examTypeId, today });
    if (!r) return ApiResponse.error(res, 404, 'Exam not found');
    name = `syllabus-readiness-${r.exam.name}`;
    header = ['Exam', 'Class', 'Section', 'Subject', 'Teacher', 'Chapters in exam', 'Chapters done', 'Coverage %', 'Periods left', 'Days to exam', 'Risk'];
    lines = r.rows.map((x) => [
      r.exam.name, r.exam.className, x.sectionName, x.subjectName, x.teachers.map((t) => t.name).join(' / '),
      x.totalChapters, x.completedChapters, x.coveragePct, x.remainingPeriods, r.examDate ? r.examDate.daysLeft : '', x.risk,
    ]);
  } else {
    const sessionId = await resolveSessionId(req);
    const classes = await svc.loadStructure({ schoolId: req.schoolId, sessionId, classId: req.query.classId || null });
    const rows = await svc.computeRows({ schoolId: req.schoolId, sessionId, combos: svc.allCombos(classes), today });
    name = 'syllabus-progress';
    header = ['Class', 'Section', 'Subject', 'Teacher', 'Chapters', 'Done', 'Coverage %', 'Expected %', 'Pace', 'Days since update'];
    lines = rows.map((x) => [
      x.className, x.sectionName, x.subjectName, x.teachers.map((t) => t.name).join(' / '),
      x.totalChapters, x.completedChapters, x.setUp ? x.coveragePct : 'Not set up', x.expectedPct ?? '', x.pace, x.daysSinceUpdate ?? '',
    ]);
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]+/g, '-')}.csv"`);
  return res.send(stringify([header, ...lines]));
});

module.exports = {
  getStructure,
  listChapters,
  createChapter,
  bulkCreateChapters,
  updateChapter,
  deleteChapter,
  listTemplates,
  applyTemplate,
  saveTemplate,
  deleteTemplate,
  getCsvTemplate,
  importCsv,
  copySyllabus,
  autoSchedule,
  getExamScope,
  saveExamScope,
  getOverview,
  getExamReadiness,
  saveProgress,
  getSectionTracker,
  sendReminder,
  exportCsv,
};