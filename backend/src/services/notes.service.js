const { prisma } = require('../config/db');
const httpError = require('../utils/httpError');
const cal = require('./calendar.service');
const storage = require('./storage.service');
const { createBulkNotifications } = require('./notification.service');
const { MB, LIMITS } = require('../config/notes.constants');
const { extractAssetIds, injectSignedImages } = require('./noteSanitizer.service');

// ---------- entitlement + quota ----------
function serializeSettings(s) {
  if (!s) {
    return { enabled: false, quotaMb: 0, maxFileMb: LIMITS.defaultFileMb, usedBytes: 0, quotaBytes: 0, usedPct: 0 };
  }
  const used = Number(s.usedBytes);
  const quotaBytes = s.quotaMb * MB;
  return {
    enabled: s.enabled,
    quotaMb: s.quotaMb,
    maxFileMb: s.maxFileMb,
    usedBytes: used,
    quotaBytes,
    usedPct: quotaBytes ? Math.min(100, Math.round((used / quotaBytes) * 1000) / 10) : 0,
  };
}

async function getSettings(schoolId) {
  return serializeSettings(await prisma.schoolNotesSettings.findUnique({ where: { schoolId } }));
}

// Parents have no schoolId in their token, so access is resolved from the child's school.
async function childNotesSettings(schoolId) {
  const [settings, school] = await Promise.all([
    getSettings(schoolId),
    prisma.school.findUnique({ where: { id: schoolId }, select: { status: true } }),
  ]);
  if (!school || school.status === 'suspended' || school.status === 'expired') return { ...settings, enabled: false };
  return settings;
}

async function reserveBytes(schoolId, bytes) {
  const n = await prisma.$executeRaw`UPDATE school_notes_settings SET used_bytes = used_bytes + ${bytes}::bigint WHERE school_id = ${schoolId} AND enabled = true AND used_bytes + ${bytes}::bigint <= quota_mb::bigint * 1048576`;
  return n > 0;
}

async function releaseBytes(schoolId, bytes) {
  if (!bytes) return;
  await prisma.$executeRaw`UPDATE school_notes_settings SET used_bytes = GREATEST(used_bytes - ${bytes}::bigint, 0) WHERE school_id = ${schoolId}`;
}

// Max allowed size for one upload, given the school's settings.
function maxBytesFor({ kind, group, settings }) {
  if (kind === 'inline_image') return LIMITS.inlineImageMaxBytes;
  const school = settings.maxFileMb * MB;
  return group === 'image' ? Math.min(LIMITS.imageAttachmentMaxBytes, school) : school;
}

async function deleteAttachmentRecord(att) {
  if (att.storageKey && storage.isConfigured()) {
    try { await storage.remove(att.storageKey); } catch (e) { /* the purge job retries orphans */ }
  }
  await prisma.noteAttachment.delete({ where: { id: att.id } }).catch(() => {});
  if (att.status === 'ready' && att.storageKey) await releaseBytes(att.schoolId, att.sizeBytes);
}

// Inline images that are no longer referenced by the note's HTML free their quota.
async function cleanupOrphanImages(noteId, html) {
  const used = new Set(extractAssetIds(html));
  const cutoff = new Date(Date.now() - LIMITS.orphanImageGraceMinutes * 60000);
  const rows = await prisma.noteAttachment.findMany({
    where: { noteId, kind: 'inline_image', status: 'ready', createdAt: { lt: cutoff } },
  });
  for (const a of rows) if (!used.has(a.id)) await deleteAttachmentRecord(a);
}

// ---------- sessions / teacher scope ----------
async function resolveSessionId(schoolId, requestedId) {
  const sessions = await prisma.academicSession.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } });
  const s = cal.resolveSession(sessions, requestedId || null);
  if (!s) throw httpError(404, 'No academic session has been set up yet');
  return s.id;
}

async function assertAssignedToSubject({ facultyId, sessionId, classId, subjectId }) {
  const a = await prisma.facultyAssignment.findFirst({ where: { facultyId, sessionId, classId, subjectId, isActive: true } });
  if (!a) throw httpError(403, 'You are not assigned to this class and subject');
}

async function assignedSectionIds({ facultyId, sessionId, classId, subjectId }) {
  const rows = await prisma.facultyAssignment.findMany({
    where: { facultyId, sessionId, classId, subjectId, isActive: true },
    select: { sectionId: true },
  });
  return [...new Set(rows.map((r) => r.sectionId))];
}

async function assertChapter({ schoolId, sessionId, classId, subjectId, chapterId }) {
  const ch = await prisma.syllabusChapter.findFirst({ where: { id: chapterId, schoolId, sessionId, classId, subjectId }, select: { id: true } });
  if (!ch) throw httpError(422, 'Selected chapter does not belong to this class and subject');
}

// Validates the audience against the teacher's real assignments and returns NoteAudience rows.
async function prepareAudience({ facultyId, schoolId, sessionId, classId, subjectId, audience }) {
  if (audience.mode === 'sections') {
    const ids = [...new Set(audience.sectionIds)];
    if (!ids.length) return [];
    const allowed = new Set(await assignedSectionIds({ facultyId, sessionId, classId, subjectId }));
    if (ids.some((id) => !allowed.has(id))) throw httpError(403, 'You are not assigned to one of the selected sections');
    return ids.map((sectionId) => ({ sectionId }));
  }
  const ids = [...new Set(audience.studentIds)];
  if (!ids.length) return [];
  const allowed = await assignedSectionIds({ facultyId, sessionId, classId, subjectId });
  if (!allowed.length) throw httpError(403, 'You are not assigned to this class and subject');
  const found = await prisma.enrollment.count({
    where: { sessionId, classId, sectionId: { in: allowed }, status: 'active', studentId: { in: ids }, student: { schoolId, status: 'active' } },
  });
  if (found !== ids.length) throw httpError(422, 'Some selected students are not in your assigned sections');
  return ids.map((studentId) => ({ studentId }));
}

function audienceFromRows(rows) {
  const studentIds = rows.filter((r) => r.studentId).map((r) => r.studentId);
  const sectionIds = rows.filter((r) => r.sectionId).map((r) => r.sectionId);
  return { mode: studentIds.length ? 'students' : 'sections', sectionIds, studentIds };
}

async function audienceStudents(note) {
  const secIds = note.audiences.filter((a) => a.sectionId).map((a) => a.sectionId);
  const stuIds = note.audiences.filter((a) => a.studentId).map((a) => a.studentId);
  const or = [];
  if (secIds.length) or.push({ sectionId: { in: secIds } });
  if (stuIds.length) or.push({ studentId: { in: stuIds } });
  if (!or.length) return [];
  const rows = await prisma.enrollment.findMany({
    where: { sessionId: note.sessionId, status: 'active', student: { schoolId: note.schoolId, status: 'active' }, OR: or },
    select: { studentId: true, rollNumber: true, student: { select: { name: true } }, section: { select: { name: true } } },
  });
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.studentId)) seen.set(r.studentId, { id: r.studentId, name: r.student.name, rollNumber: r.rollNumber, sectionName: r.section.name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function readersFor(note) {
  const [students, views] = await Promise.all([audienceStudents(note), prisma.noteView.findMany({ where: { noteId: note.id } })]);
  const vm = new Map(views.map((v) => [v.studentId, v.viewedAt]));
  const rows = students.map((s) => ({ ...s, viewedAt: vm.get(s.id) || null }));
  const viewed = rows.filter((r) => r.viewedAt).length;
  return { total: rows.length, viewed, percent: rows.length ? Math.round((viewed / rows.length) * 100) : 0, students: rows };
}

// ---------- publishing ----------
// Claims notifiedAt first, so a note only ever notifies once, even if publish/job race.
async function notifyPublished(noteId) {
  const claimed = await prisma.note.updateMany({ where: { id: noteId, notifiedAt: null }, data: { notifiedAt: new Date() } });
  if (!claimed.count) return 0;
  const note = await prisma.note.findUnique({ where: { id: noteId }, include: { audiences: true } });
  if (!note) return 0;
  const [students, subject] = await Promise.all([
    audienceStudents(note),
    prisma.subject.findUnique({ where: { id: note.subjectId }, select: { name: true } }),
  ]);
  const message = `${subject ? subject.name : 'Subject'}: ${note.title}`.slice(0, 200);
  await createBulkNotifications(students.map((s) => ({
    schoolId: note.schoolId, recipientType: 'parent', recipientRef: s.id, title: 'New study note', message, type: 'note_published',
  })));
  return students.length;
}

// ---------- DTOs ----------
async function viewStats(list) {
  const out = new Map();
  const pub = list.filter((n) => n.status === 'published');
  if (!pub.length) return out;
  const secIds = [...new Set(pub.flatMap((n) => n.audiences.map((a) => a.sectionId).filter(Boolean)))];
  const [views, secCounts] = await Promise.all([
    prisma.noteView.groupBy({ by: ['noteId'], where: { noteId: { in: pub.map((n) => n.id) } }, _count: { _all: true } }),
    secIds.length
      ? prisma.enrollment.groupBy({ by: ['sectionId'], where: { sectionId: { in: secIds }, status: 'active', student: { status: 'active' } }, _count: { _all: true } })
      : [],
  ]);
  const vm = new Map(views.map((v) => [v.noteId, v._count._all]));
  const sm = new Map(secCounts.map((s) => [s.sectionId, s._count._all]));
  for (const n of pub) {
    const audience = n.audiences.reduce((t, a) => t + (a.sectionId ? sm.get(a.sectionId) || 0 : 1), 0);
    const viewed = vm.get(n.id) || 0;
    out.set(n.id, { audience, viewed, percent: audience ? Math.min(100, Math.round((viewed / audience) * 100)) : 0 });
  }
  return out;
}

// Loads names once for a whole list and returns a function that turns a note row into a DTO.
async function hydrate(list) {
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const [subjects, classes, chapters, authors, sections, stats] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: uniq(list.map((n) => n.subjectId)) } }, select: { id: true, name: true } }),
    prisma.class.findMany({ where: { id: { in: uniq(list.map((n) => n.classId)) } }, select: { id: true, name: true } }),
    prisma.syllabusChapter.findMany({ where: { id: { in: uniq(list.map((n) => n.chapterId)) } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: uniq(list.map((n) => n.authorId)) } }, select: { id: true, name: true } }),
    prisma.section.findMany({ where: { id: { in: uniq(list.flatMap((n) => (n.audiences || []).map((a) => a.sectionId))) } }, select: { id: true, name: true } }),
    viewStats(list.filter((n) => n.audiences)),
  ]);
  const map = (arr, f) => new Map(arr.map((x) => [x.id, x[f]]));
  const S = map(subjects, 'name'); const C = map(classes, 'name'); const CH = map(chapters, 'title');
  const A = map(authors, 'name'); const SEC = map(sections, 'name');

  return (n) => {
    const aud = n.audiences || [];
    const stu = aud.filter((a) => a.studentId).length;
    const secNames = aud.filter((a) => a.sectionId).map((a) => SEC.get(a.sectionId)).filter(Boolean);
    return {
      id: n.id, title: n.title, type: n.type, status: n.status,
      publishAt: n.publishAt, publishedAt: n.publishedAt, allowDownload: n.allowDownload,
      createdAt: n.createdAt, updatedAt: n.updatedAt, takedownReason: n.takedownReason,
      classId: n.classId, className: C.get(n.classId) || '',
      subjectId: n.subjectId, subjectName: S.get(n.subjectId) || '',
      chapterId: n.chapterId, chapterTitle: n.chapterId ? CH.get(n.chapterId) || '' : '',
      authorId: n.authorId, authorName: A.get(n.authorId) || 'Former teacher',
      audienceLabel: stu ? `${stu} selected student${stu > 1 ? 's' : ''}` : secNames.join(', '),
      fileCount: (n.attachments || []).filter((a) => a.kind !== 'inline_image' && a.status === 'ready').length,
      stats: stats.get(n.id) || null,
    };
  };
}

const attDto = (a) => ({ id: a.id, kind: a.kind, fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes, url: a.kind === 'link' ? a.url : null });

async function signedHtml(note, ttl) {
  const ids = new Set(extractAssetIds(note.contentHtml));
  const imgs = (note.attachments || []).filter((a) => a.kind === 'inline_image' && a.status === 'ready' && ids.has(a.id));
  const map = {};
  await Promise.all(imgs.map(async (a) => {
    map[a.id] = await storage.presignDownload({ key: a.storageKey, contentType: a.mime, fileName: a.fileName, disposition: 'inline', expiresIn: ttl });
  }));
  return injectSignedImages(note.contentHtml, map);
}

// note must include audiences + attachments
async function detailDto(note, ttl) {
  const toDto = await hydrate([note]);
  return {
    ...toDto(note),
    contentHtml: await signedHtml(note, ttl),
    audience: audienceFromRows(note.audiences),
    attachments: note.attachments.filter((a) => a.kind !== 'inline_image' && a.status === 'ready').map(attDto),
  };
}

async function presignAttachment(att, disposition) {
  if (att.kind === 'link') return { url: att.url, expiresIn: null };
  const url = await storage.presignDownload({
    key: att.storageKey, contentType: att.mime, fileName: att.fileName, disposition, expiresIn: LIMITS.viewUrlTtlSec,
  });
  return { url, expiresIn: LIMITS.viewUrlTtlSec };
}

// ---------- parent side ----------
async function childContext(student) {
  const enrs = await prisma.enrollment.findMany({
    where: { studentId: student.id },
    include: { session: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: { session: { startDate: 'desc' } },
  });
  if (!enrs.length) throw httpError(404, 'No enrollment found for this student');
  const session = cal.resolveSession(enrs.map((e) => e.session), null);
  const enr = enrs.find((e) => e.sessionId === session.id);
  return { enr, sessionId: session.id };
}

function visibleWhere(student, ctx) {
  return {
    schoolId: student.schoolId,
    sessionId: ctx.sessionId,
    classId: ctx.enr.classId,
    deletedAt: null,
    status: 'published',
    audiences: { some: { OR: [{ sectionId: ctx.enr.sectionId }, { studentId: student.id }] } },
  };
}

module.exports = {
  serializeSettings, getSettings, childNotesSettings, reserveBytes, releaseBytes, maxBytesFor,
  deleteAttachmentRecord, cleanupOrphanImages, resolveSessionId, assertAssignedToSubject, assignedSectionIds,
  assertChapter, prepareAudience, audienceFromRows, audienceStudents, readersFor, notifyPublished,
  hydrate, attDto, signedHtml, detailDto, presignAttachment, childContext, visibleWhere,
};