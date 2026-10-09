const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const notes = require('../../services/notes.service');
const { LIMITS } = require('../../config/notes.constants');

// GET /parent/notes/meta?studentId=...   (works even when Notes is off for the school)
const getMeta = asyncHandler(async (req, res) => {
  const settings = await notes.childNotesSettings(req.student.schoolId);
  if (!settings.enabled) return ApiResponse.success(res, 200, 'Notes info fetched', { enabled: false });

  const ctx = await notes.childContext(req.student);
  const base = notes.visibleWhere(req.student, ctx);
  const unread = { ...base, views: { none: { studentId: req.student.id } } };

  const [bySubject, unreadBySubject, byChapter] = await Promise.all([
    prisma.note.groupBy({ by: ['subjectId'], where: base, _count: { _all: true } }),
    prisma.note.groupBy({ by: ['subjectId'], where: unread, _count: { _all: true } }),
    prisma.note.groupBy({ by: ['chapterId', 'subjectId'], where: { ...base, chapterId: { not: null } }, _count: { _all: true } }),
  ]);
  const [subjects, chapters] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: bySubject.map((s) => s.subjectId) } }, select: { id: true, name: true } }),
    prisma.syllabusChapter.findMany({ where: { id: { in: byChapter.map((c) => c.chapterId) } }, select: { id: true, title: true } }),
  ]);
  const un = new Map(unreadBySubject.map((s) => [s.subjectId, s._count._all]));
  const sName = new Map(subjects.map((s) => [s.id, s.name]));
  const cName = new Map(chapters.map((c) => [c.id, c.title]));

  return ApiResponse.success(res, 200, 'Notes info fetched', {
    enabled: true,
    className: ctx.enr.class.name,
    sectionName: ctx.enr.section.name,
    totalUnread: unreadBySubject.reduce((t, s) => t + s._count._all, 0),
    subjects: bySubject
      .map((s) => ({ id: s.subjectId, name: sName.get(s.subjectId) || '', count: s._count._all, unread: un.get(s.subjectId) || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    chapters: byChapter.map((c) => ({ id: c.chapterId, title: cName.get(c.chapterId) || '', subjectId: c.subjectId, count: c._count._all })),
  });
});

// GET /parent/notes?studentId&subjectId&chapterId&type&q&unread&page&limit
const listNotes = asyncHandler(async (req, res) => {
  const ctx = await notes.childContext(req.student);
  const { subjectId, chapterId, type, q, unread } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
  const where = {
    ...notes.visibleWhere(req.student, ctx),
    ...(subjectId ? { subjectId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(type ? { type } : {}),
    ...(unread === '1' ? { views: { none: { studentId: req.student.id } } } : {}),
    ...(q ? { OR: [{ title: { contains: String(q), mode: 'insensitive' } }, { contentText: { contains: String(q), mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.note.findMany({
      where, orderBy: { publishedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      omit: { contentHtml: true, contentText: true },
      include: {
        attachments: { select: { kind: true, status: true } },
        views: { where: { studentId: req.student.id }, select: { id: true } },
      },
    }),
    prisma.note.count({ where }),
  ]);
  const toDto = await notes.hydrate(rows);
  return ApiResponse.success(res, 200, 'Notes fetched', {
    notes: rows.map((n) => ({ ...toDto(n), isNew: n.views.length === 0 })),
    total, page, totalPages: Math.ceil(total / limit),
  });
});

// GET /parent/notes/:id?studentId=...   (opening a note records the read receipt)
const getNote = asyncHandler(async (req, res) => {
  const ctx = await notes.childContext(req.student);
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, ...notes.visibleWhere(req.student, ctx) },
    include: { attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!note) throw httpError(404, 'Note not found');

  await prisma.noteView.upsert({
    where: { noteId_studentId: { noteId: note.id, studentId: req.student.id } },
    update: {},
    create: { noteId: note.id, studentId: req.student.id },
  });

  const toDto = await notes.hydrate([note]);
  return ApiResponse.success(res, 200, 'Note fetched', {
    ...toDto(note),
    contentHtml: await notes.signedHtml(note, LIMITS.viewUrlTtlSec),
    attachments: note.attachments.filter((a) => a.kind !== 'inline_image' && a.status === 'ready').map(notes.attDto),
  });
});

// GET /parent/notes/:id/attachments/:attId/url?studentId&disposition=inline|attachment
const getAttachmentUrl = asyncHandler(async (req, res) => {
  const ctx = await notes.childContext(req.student);
  const att = await prisma.noteAttachment.findFirst({
    where: {
      id: req.params.attId, noteId: req.params.id, status: 'ready', kind: { not: 'inline_image' },
      note: notes.visibleWhere(req.student, ctx),
    },
    include: { note: { select: { allowDownload: true } } },
  });
  if (!att) throw httpError(404, 'Attachment not found');

  let disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  if (!att.note.allowDownload && att.kind === 'file') {
    // View-only note: PDFs and images can be previewed in the browser, nothing else is handed out.
    // (This cannot stop screenshots, it only removes the download button.)
    const previewable = att.mime === 'application/pdf' || (att.mime || '').startsWith('image/');
    if (!previewable || disposition === 'attachment') throw httpError(403, 'The teacher has set this note to view-only');
    disposition = 'inline';
  }
  return ApiResponse.success(res, 200, 'Link ready', await notes.presignAttachment(att, disposition));
});

module.exports = { getMeta, listNotes, getNote, getAttachmentUrl };