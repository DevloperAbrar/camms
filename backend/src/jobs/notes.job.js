const cron = require('node-cron');
const { prisma } = require('../config/db');
const logger = require('../utils/logger');
const storage = require('../services/storage.service');
const notesSvc = require('../services/notes.service');
const { LIMITS } = require('../config/notes.constants');

// Every minute: publish scheduled notes whose time has come
async function publishDueNotes() {
  const due = await prisma.note.findMany({
    where: { status: 'scheduled', publishAt: { lte: new Date() }, deletedAt: null },
    select: { id: true, publishedAt: true },
    take: 100,
  });
  for (const n of due) {
    const claimed = await prisma.note.updateMany({
      where: { id: n.id, status: 'scheduled' },
      data: { status: 'published', publishAt: null, publishedAt: new Date() },
    });
    if (claimed.count) await notesSvc.notifyPublished(n.id);
  }
}

// Hourly: drop uploads that were never confirmed, and permanently remove notes deleted long ago
async function cleanup() {
  if (!storage.isConfigured()) return;

  const stale = await prisma.noteAttachment.findMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - LIMITS.pendingUploadTtlHours * 3600000) } },
    take: 200,
  });
  if (stale.length) {
    await storage.removeMany(stale.map((a) => a.storageKey));
    await prisma.noteAttachment.deleteMany({ where: { id: { in: stale.map((a) => a.id) } } });
  }

  const trashed = await prisma.note.findMany({
    where: { deletedAt: { lt: new Date(Date.now() - LIMITS.trashRetentionDays * 86400000) } },
    include: { attachments: true },
    take: 50,
  });
  for (const n of trashed) {
    await storage.removeMany(n.attachments.map((a) => a.storageKey));
    const bytes = n.attachments.filter((a) => a.status === 'ready' && a.storageKey).reduce((t, a) => t + a.sizeBytes, 0);
    await prisma.note.delete({ where: { id: n.id } });
    await notesSvc.releaseBytes(n.schoolId, bytes);
  }
}

function startNotesJobs() {
  cron.schedule('* * * * *', async () => {
    try { await publishDueNotes(); } catch (err) { logger.error('Notes publish job failed', err); }
  });
  cron.schedule('17 * * * *', async () => {
    try { await cleanup(); } catch (err) { logger.error('Notes cleanup job failed', err); }
  });
}

module.exports = { startNotesJobs };