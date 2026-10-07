const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const cal = require('../../services/calendar.service');
const svc = require('../../services/syllabus.service');
const { saveProgressSchema } = require('../../validators/syllabus.validator');

// Combos this teacher can SEE. editable = they teach that subject in that section.
// Class teachers can additionally view every subject of their section (read-only), same rule as facultyScope.service.js
// Combos this teacher can SEE and edit: only the subjects they are actually assigned to teach.
async function loadCombos(req, sessionId) {
  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, sessionId },
    select: {
      classId: true, sectionId: true, subjectId: true,
      class: { select: { name: true } }, section: { select: { name: true } }, subject: { select: { name: true } },
    },
  });

  const map = new Map();
  for (const a of assignments) {
    map.set(`${a.sectionId}|${a.subjectId}`, {
      classId: a.classId, className: a.class.name, sectionId: a.sectionId, sectionName: a.section.name,
      subjectId: a.subjectId, subjectName: a.subject.name, editable: true,
    });
  }
  return [...map.values()];
}

async function resolveSessionId(req) {
  if (req.query.sessionId) {
    const s = await prisma.academicSession.findFirst({ where: { id: req.query.sessionId, schoolId: req.schoolId }, select: { id: true } });
    if (!s) throw httpError(404, 'Session not found');
    return s.id;
  }
  const sessions = await prisma.academicSession.findMany({ where: { schoolId: req.schoolId }, orderBy: { startDate: 'desc' } });
  const s = cal.resolveSession(sessions, null);
  if (!s) throw httpError(404, 'No academic session has been set up yet');
  return s.id;
}

// GET /faculty/syllabus/my-classes
const getMyClasses = asyncHandler(async (req, res) => {
  const sessionId = await resolveSessionId(req);
  const today = await svc.getToday(req.schoolId);
  const combos = await loadCombos(req, sessionId);
  const rows = await svc.computeRows({ schoolId: req.schoolId, sessionId, combos, today });

  const classIds = [...new Set(combos.map((c) => c.classId))];
  const examTypes = classIds.length
    ? await prisma.examType.findMany({
        where: { schoolId: req.schoolId, sessionId, classId: { in: classIds } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, classId: true },
      })
    : [];

  rows.sort((a, b) => a.className.localeCompare(b.className) || a.sectionName.localeCompare(b.sectionName) || a.subjectName.localeCompare(b.subjectName));
  return ApiResponse.success(res, 200, 'Syllabus overview fetched', { sessionId, today, rows, examTypes });
});

// GET /faculty/syllabus/tracker
const getTracker = asyncHandler(async (req, res) => {
  const { classId, sectionId, subjectId } = req.query;
  if (!classId || !sectionId || !subjectId) return ApiResponse.error(res, 422, 'classId, sectionId and subjectId are required');
  const sessionId = await resolveSessionId(req);

  const combos = await loadCombos(req, sessionId);
  const combo = combos.find((c) => c.classId === classId && c.sectionId === sectionId && c.subjectId === subjectId);
  if (!combo) return ApiResponse.error(res, 403, 'You do not have access to this class and subject');

  const today = await svc.getToday(req.schoolId);
  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId, classId, subjectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { examScopes: { select: { examType: { select: { name: true } } } } },
  });
  const progress = await prisma.syllabusProgress.findMany({ where: { schoolId: req.schoolId, sectionId, chapterId: { in: chapters.map((c) => c.id) } } });
  const pmap = new Map(progress.map((p) => [p.chapterId, p]));

  return ApiResponse.success(res, 200, 'Tracker fetched', {
    today,
    sessionId,
    editable: combo.editable,
    label: { className: combo.className, sectionName: combo.sectionName, subjectName: combo.subjectName },
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

// PUT /faculty/syllabus/progress  (only for subjects the teacher actually teaches in that section)
const saveProgress = asyncHandler(async (req, res) => {
  const data = saveProgressSchema.parse(req.body);

  const assigned = await prisma.facultyAssignment.findFirst({
    where: { facultyId: req.user.id, sessionId: data.sessionId, classId: data.classId, sectionId: data.sectionId, subjectId: data.subjectId, isActive: true },
  });
  if (!assigned) return ApiResponse.error(res, 403, 'You are not assigned to teach this subject in this class and section');

  await svc.assertProgressTarget({
    schoolId: req.schoolId, sessionId: data.sessionId, classId: data.classId, sectionId: data.sectionId, subjectId: data.subjectId,
    chapterIds: data.updates.map((u) => u.chapterId),
  });
  const today = await svc.getToday(req.schoolId);
  const count = await svc.saveProgress({ schoolId: req.schoolId, userId: req.user.id, sectionId: data.sectionId, updates: data.updates, today });

  await logAudit({ req, action: 'UPDATE_SYLLABUS_PROGRESS', resourceType: 'section', resourceId: data.sectionId, metadata: { subjectId: data.subjectId, count } });
  return ApiResponse.success(res, 200, 'Progress saved', { count });
});

// GET /faculty/syllabus/exam-readiness  (limited to the sections and subjects this teacher can see)
const getReadiness = asyncHandler(async (req, res) => {
  if (!req.query.examTypeId) return ApiResponse.error(res, 422, 'examTypeId is required');
  const examType = await prisma.examType.findFirst({ where: { id: req.query.examTypeId, schoolId: req.schoolId }, select: { id: true, sessionId: true } });
  if (!examType) return ApiResponse.error(res, 404, 'Exam not found');

  const combos = await loadCombos(req, examType.sessionId);
  const allow = new Set(combos.map((c) => `${c.sectionId}|${c.subjectId}`));
  const today = await svc.getToday(req.schoolId);
  const result = await svc.buildReadiness({ schoolId: req.schoolId, examTypeId: examType.id, today, allow });
  return ApiResponse.success(res, 200, 'Exam readiness fetched', { today, ...result });
});

module.exports = { getMyClasses, getTracker, saveProgress, getReadiness };