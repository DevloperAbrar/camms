const { prisma } = require('../config/db');

async function getAuditLogs({ schoolId = null, page = 1, limit = 50 }) {
  const where = schoolId ? { schoolId } : {};

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { actor: { select: { name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, page, totalPages: Math.ceil(total / limit) };
}

module.exports = { getAuditLogs };