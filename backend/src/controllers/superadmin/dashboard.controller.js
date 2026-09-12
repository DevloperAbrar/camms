const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');

const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [
    totalSchools,
    activeSchools,
    trialSchools,
    expiredSchools,
    suspendedSchools,
    renewalsDue,
    recentRenewals,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.school.count({ where: { status: 'active' } }),
    prisma.school.count({ where: { status: 'trial' } }),
    prisma.school.count({ where: { status: 'expired' } }),
    prisma.school.count({ where: { status: 'suspended' } }),
    prisma.schoolSubscription.count({
      where: {
        status: { in: ['active', 'trial'] },
        endDate: { gte: now, lte: thirtyDaysFromNow },
      },
    }),
    prisma.subscriptionRenewal.findMany({
      where: { renewedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
      select: { amount: true },
    }),
  ]);

  const monthRevenue = recentRenewals.reduce((sum, r) => sum + Number(r.amount), 0);

  return ApiResponse.success(res, 200, 'Dashboard stats fetched', {
    totalSchools,
    activeSchools,
    trialSchools,
    expiredSchools,
    suspendedSchools,
    renewalsDueNext30Days: renewalsDue,
    monthRevenue,
  });
});

const getSchoolUsage = asyncHandler(async (req, res) => {
  const schools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { students: true, users: true } },
      users: {
        where: { role: 'admin' },
        select: { lastLogin: true },
        orderBy: { lastLogin: 'desc' },
        take: 1,
      },
    },
  });

  const usage = schools.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    studentCount: s._count.students,
    userCount: s._count.users,
    lastAdminLogin: s.users[0] ? s.users[0].lastLogin : null,
  }));

  return ApiResponse.success(res, 200, 'School usage fetched', usage);
});

module.exports = { getDashboardStats, getSchoolUsage };