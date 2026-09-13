const { prisma } = require('../config/db');

// ---------------------------------------------------------------------------
// VIEW scope vs MARK scope
// ---------------------------------------------------------------------------
// A faculty member can VIEW analytics/reports for two kinds of class/sections:
//   1. Every class/section they have an active FacultyAssignment in (any subject)
//   2. Every section where they are the Class Teacher (Section.classTeacherId),
//      even for subjects they don't personally teach there.
//
// MARKING attendance / entering marks stays restricted to actual
// FacultyAssignment rows (see faculty/attendance.controller.js and
// faculty/marks.controller.js) — being a class teacher does NOT grant the
// right to enter marks/attendance for a subject you don't teach. This file is
// for read-only analytics/report scope only.
// ---------------------------------------------------------------------------

/**
 * Returns every {sessionId, classId, sectionId, isClassTeacher} pair this
 * faculty is allowed to VIEW analytics/reports for.
 */
async function getFacultyViewableSections({ facultyId, sessionId }) {
  const [assignments, classTeacherSections] = await Promise.all([
    prisma.facultyAssignment.findMany({
      where: { facultyId, isActive: true, ...(sessionId ? { sessionId } : {}) },
      select: { sessionId: true, classId: true, sectionId: true },
    }),
    prisma.section.findMany({
      where: {
        classTeacherId: facultyId,
        ...(sessionId ? { class: { sessionId } } : {}),
      },
      select: { id: true, classId: true, class: { select: { sessionId: true } } },
    }),
  ]);

  const map = new Map();

  for (const a of assignments) {
    const key = `${a.sessionId}|${a.classId}|${a.sectionId}`;
    if (!map.has(key)) {
      map.set(key, { sessionId: a.sessionId, classId: a.classId, sectionId: a.sectionId, isClassTeacher: false });
    }
  }

  for (const s of classTeacherSections) {
    const key = `${s.class.sessionId}|${s.classId}|${s.id}`;
    if (map.has(key)) {
      map.get(key).isClassTeacher = true;
    } else {
      map.set(key, { sessionId: s.class.sessionId, classId: s.classId, sectionId: s.id, isClassTeacher: true });
    }
  }

  return [...map.values()];
}

/**
 * True if this faculty can VIEW (not necessarily mark) this exact class/section.
 * Also tells the caller whether the access came from being the class teacher.
 */
async function canViewSection({ facultyId, sessionId, classId, sectionId }) {
  const [assigned, classTeacherSection] = await Promise.all([
    prisma.facultyAssignment.findFirst({
      where: { facultyId, sessionId, classId, sectionId, isActive: true },
    }),
    prisma.section.findFirst({ where: { id: sectionId, classId, classTeacherId: facultyId } }),
  ]);

  return { allowed: !!(assigned || classTeacherSection), isClassTeacher: !!classTeacherSection };
}

/**
 * Subject scope for a class: a faculty who is the class teacher of ANY section
 * in that class can view ALL subjects taught in the class. Everyone else is
 * limited to the subjects they are personally assigned to teach there.
 */
async function getFacultyViewableSubjectIds({ facultyId, sessionId, classId }) {
  const isClassTeacherOfClass = await prisma.section.findFirst({
    where: { classId, classTeacherId: facultyId },
  });

  if (isClassTeacherOfClass) {
    const subjects = await prisma.subject.findMany({ where: { classId, sessionId }, select: { id: true } });
    return subjects.map((s) => s.id);
  }

  const assignments = await prisma.facultyAssignment.findMany({
    where: { facultyId, sessionId, classId, isActive: true },
    select: { subjectId: true },
  });
  return [...new Set(assignments.map((a) => a.subjectId))];
}

module.exports = { getFacultyViewableSections, canViewSection, getFacultyViewableSubjectIds };