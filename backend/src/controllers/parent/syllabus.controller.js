const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const cal = require('../../services/calendar.service');
const svc = require('../../services/syllabus.service');

// GET /parent/syllabus?studentId=...  (read-only, scoped to the child's own section)
const getChildSyllabus = asyncHandler(async (req, res) => {
  const schoolId = req.student.schoolId;
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: req.student.id },
    include: { session: true, class: { select: { id: true, name: true } }, section: { select: { id: true, name: true } } },
    orderBy: { session: { startDate: 'desc' } },
  });
  if (!enrollments.length) throw httpError(404, 'No enrollment found for this student');

  const sessions = enrollments.map((e) => e.session);
  const session = cal.resolveSession(sessions, req.query.sessionId);
  const enr = enrollments.find((e) => e.sessionId === session.id);
  const today = await svc.getToday(schoolId);

  const [subjects, chapters] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId, classId: enr.classId, sessionId: session.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.syllabusChapter.findMany({
      where: { schoolId, sessionId: session.id, classId: enr.classId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { examScopes: { select: { examType: { select: { name: true } } } } },
    }),
  ]);
  const progress = chapters.length
    ? await prisma.syllabusProgress.findMany({ where: { schoolId, sectionId: enr.sectionId, chapterId: { in: chapters.map((c) => c.id) } } })
    : [];
  const pmap = new Map(progress.map((p) => [p.chapterId, p]));

  const subjectCards = subjects.map((s) => {
    const list = chapters.filter((c) => c.subjectId === s.id);
    return {
      id: s.id,
      name: s.name,
      setUp: list.length > 0,
      ...svc.summarise(list, (id) => pmap.get(id), today),
      chapters: list.map((c) => {
        const p = pmap.get(c.id);
        return {
          id: c.id, title: c.title, unitName: c.unitName,
          status: p ? p.status : 'not_started',
          percentDone: p ? p.percentDone : 0,
          isRevised: p ? p.isRevised : false,
          completedOn: p ? svc.ymdOrNull(p.completedOn) : null,
          exams: c.examScopes.map((x) => x.examType.name),
        };
      }),
    };
  });

  // Exams that have a syllabus defined, with this child's section progress
  const examTypes = await prisma.examType.findMany({
    where: { schoolId, sessionId: session.id, classId: enr.classId, syllabusScopes: { some: {} } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true },
  });
  const exams = [];
  for (const et of examTypes) {
    const r = await svc.buildReadiness({ schoolId, examTypeId: et.id, today, sectionIds: [enr.sectionId] });
    if (!r) continue;
    exams.push({
      id: r.exam.id,
      name: r.exam.name,
      examDate: r.examDate,
      coveragePct: r.summary.coveragePct,
      subjects: r.rows.map((x) => ({ subjectName: x.subjectName, totalChapters: x.totalChapters, completedChapters: x.completedChapters, coveragePct: x.coveragePct })),
    });
  }

  return ApiResponse.success(res, 200, 'Syllabus fetched', {
    today,
    session: cal.sessionDto(session),
    sessions: sessions.map(cal.sessionDto),
    className: enr.class.name,
    sectionName: enr.section.name,
    subjects: subjectCards,
    exams,
  });
});

module.exports = { getChildSyllabus };