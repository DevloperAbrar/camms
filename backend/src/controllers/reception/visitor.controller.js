const { stringify } = require('csv-stringify/sync');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const V = require('../../validators/reception.validator');
const S = require('../../services/reception.service');
const { PURPOSES } = require('../../config/reception.constants');

function buildWhere(req, q = {}) {
  const { tz } = req.reception;
  const where = { schoolId: req.schoolId };
  const and = [];

  if (q.status === 'in') where.checkOutAt = null;
  else if (q.status === 'out') where.checkOutAt = { not: null };
  if (PURPOSES.includes(q.purpose)) where.purpose = q.purpose;

  const from = S.safeDate(q.from);
  const to = S.safeDate(q.to);
  if (from || to) {
    where.checkInAt = {
      ...(from ? { gte: S.dayStart(q.from, tz) } : {}),
      ...(to ? { lt: S.dayStart(S.addDaysStr(q.to, 1), tz) } : {}),
    };
  }

  const s = String(q.search || '').trim();
  if (s) {
    const digits = S.normalizePhone(s);
    and.push({
      OR: [
        { name: { contains: s, mode: 'insensitive' } },
        { passNo: { contains: s, mode: 'insensitive' } },
        { hostName: { contains: s, mode: 'insensitive' } },
        { badgeNumber: { contains: s, mode: 'insensitive' } },
        { vehicleNumber: { contains: s, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

const listVisitors = asyncHandler(async (req, res) => {
  const q = req.query;
  const { tz, today } = req.reception;
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 30));
  const where = buildWhere(req, q);

  const [visitors, total, inside] = await Promise.all([
    prisma.visitor.findMany({ where, orderBy: { checkInAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.visitor.count({ where }),
    prisma.visitor.count({ where: { ...buildWhere(req, { ...q, status: undefined }), checkOutAt: null } }),
  ]);

  return ApiResponse.success(res, 200, 'Visitors fetched', {
    visitors,
    total,
    inside,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    todayStart: S.dayStart(today, tz).toISOString(),
  });
});

const createVisitor = asyncHandler(async (req, res) => {
  const data = V.createVisitorSchema.parse(req.body);
  const { schoolId } = req;

  const fields = await S.loadFields(prisma, schoolId, 'visitor');
  const customData = S.validateCustomData(fields, data.customData);

  let hostUserId = null;
  let hostName = data.hostName ?? null;
  if (data.hostUserId) {
    const host = await prisma.user.findFirst({
      where: { id: data.hostUserId, schoolId, role: { in: ['admin', 'faculty', 'receptionist'] }, status: 'active' },
      select: { id: true, name: true },
    });
    if (!host) throw httpError(422, 'Selected staff member was not found');
    hostUserId = host.id;
    hostName = host.name;
  }

  let studentName = null;
  if (data.studentId) {
    const st = await prisma.student.findFirst({ where: { id: data.studentId, schoolId }, select: { name: true } });
    if (!st) throw httpError(422, 'Selected student was not found');
    studentName = st.name;
  }

  if (data.enquiryId) {
    const enq = await prisma.enquiry.findFirst({ where: { id: data.enquiryId, schoolId }, select: { id: true } });
    if (!enq) throw httpError(422, 'Selected enquiry was not found');
  }

  if (!data.force) {
    const duplicates = await prisma.visitor.findMany({
      where: { schoolId, phone: data.phone, checkOutAt: null },
      select: { id: true, passNo: true, name: true, checkInAt: true },
      take: 3,
    });
    if (duplicates.length) {
      return ApiResponse.error(res, 409, 'This phone number is already checked in and has not checked out', { duplicates });
    }
  }

  await S.ensureCounter(schoolId, 'visitor');

  const visitor = await prisma.$transaction(async (tx) => {
    const seq = await S.nextNumber(tx, schoolId, 'visitor');
    return tx.visitor.create({
      data: {
        schoolId,
        visitSeq: seq,
        passNo: `VIS-${String(seq).padStart(6, '0')}`,
        name: data.name,
        phone: data.phone,
        purpose: data.purpose,
        purposeNote: data.purposeNote ?? null,
        hostUserId,
        hostName,
        studentId: data.studentId ?? null,
        studentName,
        enquiryId: data.enquiryId ?? null,
        headCount: data.headCount ?? 1,
        idProofType: data.idProofType ?? null,
        idProofLast4: data.idProofLast4 ?? null,
        vehicleNumber: data.vehicleNumber ?? null,
        badgeNumber: data.badgeNumber ?? null,
        remarks: data.remarks ?? null,
        customData,
        checkInById: req.user.id,
        checkInByName: req.user.name,
      },
    });
  });

  await logAudit({ req, action: 'VISITOR_CHECK_IN', resourceType: 'visitor', resourceId: visitor.id, metadata: { passNo: visitor.passNo } });
  return ApiResponse.success(res, 201, `Checked in: ${visitor.passNo}`, visitor);
});

const checkoutVisitor = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const done = await prisma.visitor.updateMany({
    where: { id: req.params.id, schoolId, checkOutAt: null },
    data: { checkOutAt: new Date(), checkOutById: req.user.id, checkOutByName: req.user.name },
  });

  if (done.count === 0) {
    const exists = await prisma.visitor.findFirst({ where: { id: req.params.id, schoolId }, select: { id: true } });
    if (!exists) return ApiResponse.error(res, 404, 'Visitor entry not found');
    return ApiResponse.error(res, 409, 'This visitor is already checked out');
  }

  const visitor = await prisma.visitor.findFirst({ where: { id: req.params.id, schoolId } });
  await logAudit({ req, action: 'VISITOR_CHECK_OUT', resourceType: 'visitor', resourceId: visitor.id, metadata: { passNo: visitor.passNo } });
  return ApiResponse.success(res, 200, 'Checked out', visitor);
});

// Admin: end-of-day cleanup for people the desk forgot to check out
const checkoutAll = asyncHandler(async (req, res) => {
  const done = await prisma.visitor.updateMany({
    where: { schoolId: req.schoolId, checkOutAt: null },
    data: { checkOutAt: new Date(), checkOutById: req.user.id, checkOutByName: req.user.name, autoCheckedOut: true },
  });
  await logAudit({ req, action: 'VISITOR_CHECK_OUT_ALL', resourceType: 'visitor', metadata: { count: done.count } });
  return ApiResponse.success(res, 200, `${done.count} visitor(s) checked out`, { count: done.count });
});

const deleteVisitor = asyncHandler(async (req, res) => {
  const v = await prisma.visitor.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!v) return ApiResponse.error(res, 404, 'Visitor entry not found');
  await prisma.visitor.delete({ where: { id: v.id } });
  await logAudit({ req, action: 'DELETE_VISITOR', resourceType: 'visitor', resourceId: v.id, metadata: { passNo: v.passNo, name: v.name } });
  return ApiResponse.success(res, 200, 'Visitor entry deleted');
});

const exportCsv = asyncHandler(async (req, res) => {
  const { tz } = req.reception;
  const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: tz, hour12: false }) : '');
  const rows = await prisma.visitor.findMany({ where: buildWhere(req, req.query), orderBy: { checkInAt: 'asc' }, take: 20000 });
  const out = rows.map((v) => ({
    'Pass No': v.passNo,
    Name: v.name,
    Phone: v.phone,
    Purpose: v.purpose,
    Host: v.hostName || '',
    Student: v.studentName || '',
    'Head Count': v.headCount,
    'ID Type': v.idProofType || '',
    'ID Last Digits': v.idProofLast4 || '',
    Vehicle: v.vehicleNumber || '',
    Badge: v.badgeNumber || '',
    'Check-in': fmt(v.checkInAt),
    'Check-out': fmt(v.checkOutAt),
    'Duration (min)': v.checkOutAt ? Math.round((new Date(v.checkOutAt) - new Date(v.checkInAt)) / 60000) : '',
    'Auto Checked-out': v.autoCheckedOut ? 'Yes' : '',
    'Checked In By': v.checkInByName,
    Remarks: v.remarks || '',
  }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="visitors.csv"');
  return res.send(`\uFEFF${stringify(out, { header: true })}`);
});

module.exports = { listVisitors, createVisitor, checkoutVisitor, checkoutAll, deleteVisitor, exportCsv };