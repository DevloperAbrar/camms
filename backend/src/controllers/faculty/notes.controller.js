const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const storage = require('../../services/storage.service');
const notes = require('../../services/notes.service');
const { sanitizeNoteHtml, htmlToText } = require('../../services/noteSanitizer.service');
const { FILE_TYPES, LIMITS, MB, matchesMagic } = require('../../config/notes.constants');
const V = require('../../validators/notes.validator');

async function loadOwned(req, id) {
  const note = await prisma.note.findFirst({
    where: { id, schoolId: req.schoolId, authorId: req.user.id, deletedAt: null },
    include: { audiences: true, attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!note) throw httpError(404, 'Note not found');
  return note;
}

const assertEditable = (n) => {
  if (n.status === 'taken_down') throw httpError(403, 'This note was taken down by the school admin');
};

// GET /faculty/notes/meta  (works even when Notes is off, so the page can explain why)
const getMeta = asyncHandler(async (req, res) => {
  const settings = await notes.getSettings(req.schoolId);
  if (!settings.enabled) return ApiResponse.success(res, 200, 'Notes info fetched', { enabled: false, settings, classes: [] });

  const sessionId = await notes.resolveSessionId(req.schoolId, req.query.sessionId);
  const rows = await prisma.facultyAssignment.findMany({
    where: { facultyId: req.user.id, isActive: true, sessionId },
    select: {
      classId: true, sectionId: true, subjectId: true,
      class: { select: { name: true, sortOrder: true } }, section: { select: { name: true } }, subject: { select: { name: true } },
    },
  });
  const classes = new Map();
  for (const r of rows) {
    if (!classes.has(r.classId)) classes.set(r.classId, { classId: r.classId, className: r.class.name, sortOrder: r.class.sortOrder, subjects: new Map() });
    const c = classes.get(r.classId);
    if (!c.subjects.has(r.subjectId)) c.subjects.set(r.subjectId, { subjectId: r.subjectId, subjectName: r.subject.name, sections: [] });
    const s = c.subjects.get(r.subjectId);
    if (!s.sections.some((x) => x.id === r.sectionId)) s.sections.push({ id: r.sectionId, name: r.section.name });
  }
  const out = [...classes.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.className.localeCompare(b.className))
    .map((c) => ({ classId: c.classId, className: c.className, subjects: [...c.subjects.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName)) }));

  return ApiResponse.success(res, 200, 'Notes info fetched', { enabled: true, settings, sessionId, classes: out });
});

// GET /faculty/notes/chapters?classId&subjectId
const getChapters = asyncHandler(async (req, res) => {
  const { classId, subjectId } = req.query;
  if (!classId || !subjectId) return ApiResponse.error(res, 422, 'classId and subjectId are required');
  const sessionId = await notes.resolveSessionId(req.schoolId, req.query.sessionId);
  await notes.assertAssignedToSubject({ facultyId: req.user.id, sessionId, classId, subjectId });
  const chapters = await prisma.syllabusChapter.findMany({
    where: { schoolId: req.schoolId, sessionId, classId, subjectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, unitName: true },
  });
  return ApiResponse.success(res, 200, 'Chapters fetched', chapters);
});

// GET /faculty/notes/students?classId&subjectId&sectionId
const getStudents = asyncHandler(async (req, res) => {
  const { classId, subjectId, sectionId } = req.query;
  if (!classId || !subjectId || !sectionId) return ApiResponse.error(res, 422, 'classId, subjectId and sectionId are required');
  const sessionId = await notes.resolveSessionId(req.schoolId, req.query.sessionId);
  const allowed = await notes.assignedSectionIds({ facultyId: req.user.id, sessionId, classId, subjectId });
  if (!allowed.includes(sectionId)) throw httpError(403, 'You are not assigned to this section');
  const rows = await prisma.enrollment.findMany({
    where: { sessionId, classId, sectionId, status: 'active', student: { schoolId: req.schoolId, status: 'active' } },
    select: { studentId: true, rollNumber: true, student: { select: { name: true } } },
  });
  const list = rows
    .map((r) => ({ id: r.studentId, name: r.student.name, rollNumber: r.rollNumber }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return ApiResponse.success(res, 200, 'Students fetched', list);
});

// GET /faculty/notes
const listNotes = asyncHandler(async (req, res) => {
  const { status, q, subjectId, classId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const where = {
    schoolId: req.schoolId, authorId: req.user.id, deletedAt: null,
    ...(status && status !== 'all' ? { status } : {}),
    ...(subjectId ? { subjectId } : {}),
    ...(classId ? { classId } : {}),
    ...(q ? { title: { contains: String(q), mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.note.findMany({
      where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      omit: { contentHtml: true },
      include: { audiences: true, attachments: { select: { kind: true, status: true } } },
    }),
    prisma.note.count({ where }),
  ]);
  const toDto = await notes.hydrate(rows);
  return ApiResponse.success(res, 200, 'Notes fetched', { notes: rows.map(toDto), total, page, totalPages: Math.ceil(total / limit) });
});

// GET /faculty/notes/:id
const getNote = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  return ApiResponse.success(res, 200, 'Note fetched', await notes.detailDto(note, LIMITS.editUrlTtlSec));
});

// POST /faculty/notes
const createNote = asyncHandler(async (req, res) => {
  const d = V.createNoteSchema.parse(req.body);
  const sessionId = await notes.resolveSessionId(req.schoolId, d.sessionId);
  await notes.assertAssignedToSubject({ facultyId: req.user.id, sessionId, classId: d.classId, subjectId: d.subjectId });
  if (d.chapterId) await notes.assertChapter({ schoolId: req.schoolId, sessionId, classId: d.classId, subjectId: d.subjectId, chapterId: d.chapterId });
  const rows = await notes.prepareAudience({
    facultyId: req.user.id, schoolId: req.schoolId, sessionId, classId: d.classId, subjectId: d.subjectId, audience: d.audience,
  });
  const html = sanitizeNoteHtml(d.contentHtml);
  const note = await prisma.note.create({
    data: {
      schoolId: req.schoolId, sessionId, authorId: req.user.id, classId: d.classId, subjectId: d.subjectId,
      chapterId: d.chapterId || null, type: d.type, title: d.title, contentHtml: html, contentText: htmlToText(html),
      allowDownload: d.allowDownload, audiences: { create: rows },
    },
  });
  return ApiResponse.success(res, 201, 'Note saved', { id: note.id });
});

// PATCH /faculty/notes/:id
const updateNote = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  const d = V.updateNoteSchema.parse(req.body);

  const classId = d.classId ?? note.classId;
  const subjectId = d.subjectId ?? note.subjectId;
  const scopeChanged = classId !== note.classId || subjectId !== note.subjectId;
  if (scopeChanged && note.status !== 'draft') throw httpError(422, 'Unpublish the note before changing its class or subject');

  await notes.assertAssignedToSubject({ facultyId: req.user.id, sessionId: note.sessionId, classId, subjectId });

  let audienceRows = null;
  if (d.audience) {
    audienceRows = await notes.prepareAudience({
      facultyId: req.user.id, schoolId: req.schoolId, sessionId: note.sessionId, classId, subjectId, audience: d.audience,
    });
  } else if (scopeChanged) {
    audienceRows = [];
  }

  const chapterId = d.chapterId !== undefined ? d.chapterId : scopeChanged ? null : note.chapterId;
  if (chapterId) await notes.assertChapter({ schoolId: req.schoolId, sessionId: note.sessionId, classId, subjectId, chapterId });

  const data = { classId, subjectId, chapterId: chapterId || null };
  if (d.title !== undefined) data.title = d.title;
  if (d.type !== undefined) data.type = d.type;
  if (d.allowDownload !== undefined) data.allowDownload = d.allowDownload;
  if (d.contentHtml !== undefined) {
    const html = sanitizeNoteHtml(d.contentHtml);
    data.contentHtml = html;
    data.contentText = htmlToText(html);
  }

  await prisma.$transaction(async (tx) => {
    await tx.note.update({ where: { id: note.id }, data });
    if (audienceRows) {
      await tx.noteAudience.deleteMany({ where: { noteId: note.id } });
      if (audienceRows.length) await tx.noteAudience.createMany({ data: audienceRows.map((r) => ({ noteId: note.id, ...r })) });
    }
  });

  if (data.contentHtml !== undefined && storage.isConfigured()) {
    await notes.cleanupOrphanImages(note.id, data.contentHtml).catch(() => {});
  }
  return ApiResponse.success(res, 200, 'Note saved', { id: note.id });
});

// POST /faculty/notes/:id/publish   body: { publishAt? }
const publishNote = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  const { publishAt } = V.publishSchema.parse(req.body || {});
  if (!note.audiences.length) throw httpError(422, 'Select who should receive this note before publishing');

  // Re-check that the teacher is still assigned (assignments can change after the draft was made)
  await notes.assertAssignedToSubject({ facultyId: req.user.id, sessionId: note.sessionId, classId: note.classId, subjectId: note.subjectId });
  await notes.prepareAudience({
    facultyId: req.user.id, schoolId: req.schoolId, sessionId: note.sessionId, classId: note.classId, subjectId: note.subjectId,
    audience: notes.audienceFromRows(note.audiences),
  });

  const future = publishAt && new Date(publishAt).getTime() > Date.now() + 30000;
  if (future) {
    await prisma.note.update({ where: { id: note.id }, data: { status: 'scheduled', publishAt: new Date(publishAt) } });
  } else {
    await prisma.note.update({ where: { id: note.id }, data: { status: 'published', publishAt: null, publishedAt: note.publishedAt || new Date() } });
    await notes.notifyPublished(note.id);
  }
  await logAudit({ req, action: future ? 'NOTE_SCHEDULE' : 'NOTE_PUBLISH', resourceType: 'note', resourceId: note.id, metadata: { title: note.title } });
  return ApiResponse.success(res, 200, future ? 'Note scheduled' : 'Note published', { id: note.id, status: future ? 'scheduled' : 'published' });
});

// POST /faculty/notes/:id/unpublish
const unpublishNote = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  await prisma.note.update({ where: { id: note.id }, data: { status: 'draft', publishAt: null, publishedAt: null } });
  await logAudit({ req, action: 'NOTE_UNPUBLISH', resourceType: 'note', resourceId: note.id, metadata: { title: note.title } });
  return ApiResponse.success(res, 200, 'Note moved back to drafts', { id: note.id });
});

// DELETE /faculty/notes/:id  (soft delete; files are purged by the cleanup job after the retention period)
const deleteNote = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
  await logAudit({ req, action: 'NOTE_DELETE', resourceType: 'note', resourceId: note.id, metadata: { title: note.title } });
  return ApiResponse.success(res, 200, 'Note deleted', null);
});

// GET /faculty/notes/:id/readers
const getReaders = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  return ApiResponse.success(res, 200, 'Read receipts fetched', await notes.readersFor(note));
});

// ---------- uploads ----------
// POST /faculty/notes/:id/uploads/initiate
const initiateUpload = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  const d = V.initiateUploadSchema.parse(req.body);
  const def = FILE_TYPES[d.mime];
  if (!def) throw httpError(422, 'This file type is not allowed. Use PDF, DOCX, PPTX, JPG, PNG or WEBP.');
  const ext = (d.fileName.split('.').pop() || '').toLowerCase();
  if (!def.exts.includes(ext)) throw httpError(422, 'The file extension does not match its type');
  if (d.kind === 'inline_image' && def.group !== 'image') throw httpError(422, 'Only images can be placed inside a note');

  const settings = req.notesSettings;
  const max = notes.maxBytesFor({ kind: d.kind, group: def.group, settings });
  if (d.sizeBytes > max) throw httpError(422, `File is too large. Maximum allowed is ${Math.floor(max / MB)} MB.`);

  const existing = note.attachments.filter((a) => a.status === 'ready' || a.createdAt > new Date(Date.now() - 3600000));
  const count = (k) => existing.filter((a) => a.kind === k).length;
  if (d.kind === 'file' && count('file') >= LIMITS.maxFilesPerNote) throw httpError(422, `You can attach up to ${LIMITS.maxFilesPerNote} files per note`);
  if (d.kind === 'inline_image' && count('inline_image') >= LIMITS.maxInlineImagesPerNote) throw httpError(422, `A note can have up to ${LIMITS.maxInlineImagesPerNote} images`);
  const total = existing.reduce((t, a) => t + a.sizeBytes, 0);
  if (total + d.sizeBytes > LIMITS.maxNoteBytes) throw httpError(422, `A note can hold at most ${LIMITS.maxNoteBytes / MB} MB of files`);
  if (settings.usedBytes + d.sizeBytes > settings.quotaBytes) throw httpError(403, 'Your school storage is full. Delete old notes or ask your admin to increase the storage.');

  const key = storage.buildKey({ schoolId: req.schoolId, noteId: note.id, ext });
  const uploadUrl = await storage.presignUpload({ key, contentType: d.mime, expiresIn: LIMITS.uploadUrlTtlSec });
  const att = await prisma.noteAttachment.create({
    data: {
      schoolId: req.schoolId, noteId: note.id, kind: d.kind, status: 'pending', storageKey: key,
      fileName: d.fileName, mime: d.mime, sizeBytes: d.sizeBytes, createdById: req.user.id,
    },
  });
  return ApiResponse.success(res, 201, 'Upload ready', {
    attachmentId: att.id, uploadUrl, headers: { 'Content-Type': d.mime }, expiresIn: LIMITS.uploadUrlTtlSec,
  });
});

// POST /faculty/notes/:id/uploads/:attId/confirm
const confirmUpload = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  const att = await prisma.noteAttachment.findFirst({ where: { id: req.params.attId, noteId: note.id, status: 'pending' } });
  if (!att) throw httpError(404, 'Upload not found');

  const fail = async (code, msg) => { await notes.deleteAttachmentRecord(att); throw httpError(code, msg); };

  const meta = await storage.head(att.storageKey);
  if (!meta) throw httpError(409, 'The file did not reach storage. Please try again.');

  const def = FILE_TYPES[att.mime];
  const max = notes.maxBytesFor({ kind: att.kind, group: def.group, settings: req.notesSettings });
  if (meta.size <= 0 || meta.size > max) return fail(422, `File is too large. Maximum allowed is ${Math.floor(max / MB)} MB.`);

  const head = await storage.readHead(att.storageKey, 16);
  if (!matchesMagic(def.magic, head)) return fail(422, 'The file content does not match its type, so it was rejected.');

  const reserved = await notes.reserveBytes(req.schoolId, meta.size);
  if (!reserved) return fail(403, 'Your school storage is full.');

  const ready = await prisma.noteAttachment.update({
    where: { id: att.id }, data: { status: 'ready', sizeBytes: meta.size, confirmedAt: new Date() },
  });
  const out = notes.attDto(ready);
  if (ready.kind === 'inline_image') {
    out.previewUrl = await storage.presignDownload({
      key: ready.storageKey, contentType: ready.mime, fileName: ready.fileName, disposition: 'inline', expiresIn: LIMITS.editUrlTtlSec,
    });
  }
  return ApiResponse.success(res, 200, 'File uploaded', out);
});

// POST /faculty/notes/:id/links
const addLink = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  assertEditable(note);
  const d = V.linkSchema.parse(req.body);
  if (note.attachments.filter((a) => a.kind === 'link').length >= LIMITS.maxLinksPerNote) {
    throw httpError(422, `You can add up to ${LIMITS.maxLinksPerNote} links per note`);
  }
  const att = await prisma.noteAttachment.create({
    data: { schoolId: req.schoolId, noteId: note.id, kind: 'link', status: 'ready', fileName: d.title, url: d.url, createdById: req.user.id },
  });
  return ApiResponse.success(res, 201, 'Link added', notes.attDto(att));
});

// DELETE /faculty/notes/:id/attachments/:attId
const removeAttachment = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  const att = note.attachments.find((a) => a.id === req.params.attId);
  if (!att) throw httpError(404, 'Attachment not found');
  await notes.deleteAttachmentRecord(att);
  return ApiResponse.success(res, 200, 'Attachment removed', null);
});

// GET /faculty/notes/:id/attachments/:attId/url?disposition=inline|attachment
const getAttachmentUrl = asyncHandler(async (req, res) => {
  const note = await loadOwned(req, req.params.id);
  const att = note.attachments.find((a) => a.id === req.params.attId && a.status === 'ready' && a.kind !== 'inline_image');
  if (!att) throw httpError(404, 'Attachment not found');
  return ApiResponse.success(res, 200, 'Link ready', await notes.presignAttachment(att, req.query.disposition));
});

module.exports = {
  getMeta, getChapters, getStudents, listNotes, getNote, createNote, updateNote, publishNote, unpublishNote,
  deleteNote, getReaders, initiateUpload, confirmUpload, addLink, removeAttachment, getAttachmentUrl,
};