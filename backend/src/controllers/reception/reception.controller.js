const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const S = require('../../services/reception.service');
const C = require('../../config/reception.constants');

// Everything the screens need in one call: lookups, staff lists and the school's custom fields.
const getMeta = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const [staff, hosts, enquiryFields, visitorFields] = await Promise.all([
    prisma.user.findMany({
      where: { schoolId, role: { in: ['admin', 'receptionist'] }, status: 'active' },
      select: { id: true, name: true, role: true }, orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { schoolId, role: { in: ['admin', 'faculty', 'receptionist'] }, status: 'active' },
      select: { id: true, name: true, role: true }, orderBy: { name: 'asc' },
    }),
    S.loadFields(prisma, schoolId, 'enquiry'),
    S.loadFields(prisma, schoolId, 'visitor'),
  ]);

  return ApiResponse.success(res, 200, 'Meta fetched', {
    school: { name: req.reception.school.name },
    today: req.reception.today,
    role: req.user.role,
    stages: C.STAGES,
    sources: C.SOURCES,
    priorities: C.PRIORITIES,
    followUpKinds: C.FOLLOWUP_KINDS,
    purposes: C.PURPOSES,
    idTypes: C.ID_TYPES,
    staff,
    hosts,
    fields: { enquiry: enquiryFields, visitor: visitorFields },
  });
});

const getDashboard = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const { tz, today } = req.reception;
  const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;

  const since = S.dayStart(S.addDaysStr(today, -(days - 1)), tz);
  const todayStart = S.dayStart(today, tz);
  const tomorrowStart = S.dayStart(S.addDaysStr(today, 1), tz);
  const t = S.toDateOnly(today);
  const open = { stage: { notIn: C.CLOSED_STAGES } };

  const [pipeline, dueToday, overdue, unscheduled, unassigned, cohort, dueList, visitorsToday, insideCount, insideList, staleInside] =
    await Promise.all([
      prisma.enquiry.groupBy({ by: ['stage'], where: { schoolId }, _count: { _all: true } }),
      prisma.enquiry.count({ where: { schoolId, ...open, nextFollowUpOn: t } }),
      prisma.enquiry.count({ where: { schoolId, ...open, nextFollowUpOn: { lt: t } } }),
      prisma.enquiry.count({ where: { schoolId, ...open, nextFollowUpOn: null } }),
      prisma.enquiry.count({ where: { schoolId, ...open, assignedToId: null } }),
      prisma.enquiry.groupBy({ by: ['source', 'stage'], where: { schoolId, createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.enquiry.findMany({
        where: { schoolId, ...open, nextFollowUpOn: { lte: t } },
        orderBy: [{ nextFollowUpOn: 'asc' }],
        take: 8,
        select: { id: true, enquiryNo: true, studentName: true, classSought: true, parentName: true, phone: true, nextFollowUpOn: true, priority: true, stage: true },
      }),
      prisma.visitor.count({ where: { schoolId, checkInAt: { gte: todayStart, lt: tomorrowStart } } }),
      prisma.visitor.count({ where: { schoolId, checkOutAt: null } }),
      prisma.visitor.findMany({
        where: { schoolId, checkOutAt: null },
        orderBy: { checkInAt: 'desc' },
        take: 15,
        select: { id: true, passNo: true, name: true, purpose: true, hostName: true, headCount: true, checkInAt: true },
      }),
      prisma.visitor.count({ where: { schoolId, checkOutAt: null, checkInAt: { lt: todayStart } } }),
    ]);

  const pipelineMap = Object.fromEntries(C.STAGES.map((s) => [s, 0]));
  pipeline.forEach((p) => { pipelineMap[p.stage] = p._count._all; });

  let total = 0;
  let admitted = 0;
  let lost = 0;
  const bySource = {};
  cohort.forEach((r) => {
    const n = r._count._all;
    total += n;
    if (r.stage === 'admitted') admitted += n;
    if (r.stage === 'lost') lost += n;
    bySource[r.source] = bySource[r.source] || { source: r.source, total: 0, admitted: 0 };
    bySource[r.source].total += n;
    if (r.stage === 'admitted') bySource[r.source].admitted += n;
  });

  return ApiResponse.success(res, 200, 'Dashboard fetched', {
    days,
    today,
    pipeline: pipelineMap,
    followUps: { dueToday, overdue, unscheduled, unassigned },
    range: {
      newEnquiries: total,
      admitted,
      lost,
      conversionRate: total ? Math.round((admitted / total) * 1000) / 10 : 0,
    },
    bySource: Object.values(bySource).sort((a, b) => b.total - a.total),
    dueList: dueList.map((d) => ({ ...d, nextFollowUpOn: S.toDateStr(d.nextFollowUpOn) })),
    visitors: { today: visitorsToday, inside: insideCount, staleInside, insideList },
  });
});

module.exports = { getMeta, getDashboard };