const { prisma } = require('../config/db');

async function getSchoolWithSubscription(schoolId) {
  return prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { plan: true },
      },
    },
  });
}

async function listSchools({ status, search, page = 1, limit = 20 }) {
  const where = {};

  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { contactEmail: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [schools, total] = await Promise.all([
    prisma.school.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: { select: { name: true } } },
        },
        _count: { select: { students: true, users: true } },
      },
    }),
    prisma.school.count({ where }),
  ]);

  return { schools, total, page, totalPages: Math.ceil(total / limit) };
}

module.exports = { getSchoolWithSubscription, listSchools };