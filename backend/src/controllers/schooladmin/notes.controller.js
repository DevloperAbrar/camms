const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createNotification } = require('../../services/notification.service');
const notes = require('../../services/notes.service');
const { LIMITS } = require('../../config/notes.constants');
const V = require('../../validators/notes.validator');

async function loadNote(req, id) {
  const note = await prisma.note.findFirst({
    where: { id, schoolId: req.schoolId, deletedAt: null },
    include: { audiences: true, attachments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!note) throw httpError(404, 'Note not found');
  return note;
}

// GET /schooladmin/notes/usage  (works even when Notes is off)
const getUsage = asyncHandler(async (req, res) => {
  const settings = await notes.getSettings(req.schoolId);
  const base = { schoolId: req.schoolId, deletedAt: null };
  const [total, published] = await Promise.all([
    prisma.note.count({ where: base }),
    prisma.note.count({ where: { ...base, status: 'published' } }),
  ]);
  return ApiResponse.success(res, 200, 'Usage fetched', { settings, total, published });
});

// GET /schooladmin/notes?status&q&page&limit
const listNotes = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const where = {
    schoolId: req.schoolId, deletedAt: null,
    ...(status && status !== 'all' ? { status } : {}),
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

// GET /schooladmin/notes/:id
const getNote = asyncHandler(async (req, res) => {
  const note = await loadNote(req, req.params.id);
  const detail = await notes.detailDto(note, LIMITS.viewUrlTtlSec);
  return ApiResponse.success(res, 200, 'Note fetched', { ...detail, readers: await notes.readersFor(note) });
});

// POST /schooladmin/notes/:id/takedown
const takedown = asyncHandler(async (req, res) => {
  const { reason } = V.takedownSchema.parse(req.body);
  const note = await loadNote(req, req.params.id);
  await prisma.note.update({
    where: { id: note.id },
    data: { status: 'taken_down', takedownReason: reason, takedownById: req.user.id, takedownAt: new Date() },
  });
  await logAudit({ req, action: 'NOTE_TAKEDOWN', resourceType: 'note', resourceId: note.id, metadata: { title: note.title, reason } });
  await createNotification({
    schoolId: req.schoolId, recipientType: 'faculty', recipientRef: note.authorId,
    title: 'Note taken down', message: `"${note.title}" was taken down by the admin: ${reason}`.slice(0, 250), type: 'note_takedown',
  }).catch(() => {});
  return ApiResponse.success(res, 200, 'Note taken down', null);
});

// POST /schooladmin/notes/:id/restore  (goes back to the teacher as a draft)
const restore = asyncHandler(async (req, res) => {
  const note = await loadNote(req, req.params.id);
  if (note.status !== 'taken_down') throw httpError(422, 'This note is not taken down');
  await prisma.note.update({
    where: { id: note.id },
    data: { status: 'draft', takedownReason: null, takedownById: null, takedownAt: null, publishedAt: null, publishAt: null },
  });
  await logAudit({ req, action: 'NOTE_RESTORE', resourceType: 'note', resourceId: note.id, metadata: { title: note.title } });
  return ApiResponse.success(res, 200, 'Note restored as a draft', null);
});

// GET /schooladmin/notes/:id/attachments/:attId/url
const getAttachmentUrl = asyncHandler(async (req, res) => {
  const note = await loadNote(req, req.params.id);
  const att = note.attachments.find((a) => a.id === req.params.attId && a.status === 'ready' && a.kind !== 'inline_image');
  if (!att) throw httpError(404, 'Attachment not found');
  return ApiResponse.success(res, 200, 'Link ready', await notes.presignAttachment(att, req.query.disposition));
});

module.exports = { getUsage, listNotes, getNote, takedown, restore, getAttachmentUrl };