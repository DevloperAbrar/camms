const { stringify } = require('csv-stringify/sync');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const V = require('../../validators/reception.validator');
const S = require('../../services/reception.service');
const { STAGES, CLOSED_STAGES, SOURCES, PRIORITIES } = require('../../config/reception.constants');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_LABEL = {
  walk_in: 'Walk-in', phone_call: 'Phone call', website: 'Website', referral: 'Referral', social_media: 'Social media',
  newspaper: 'Newspaper', hoarding: 'Hoarding / banner', school_event: 'School event', other: 'Other',
};

const serialize = (e) => ({ ...e, dob: S.toDateStr(e.dob), nextFollowUpOn: S.toDateStr(e.nextFollowUpOn) });
const serializeFollowUp = (f) => ({ ...f, nextFollowUpOn: S.toDateStr(f.nextFollowUpOn) });
const findOwn = (req) => prisma.enquiry.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });

function assertNotPast(req, dateStr) {
  if (dateStr && dateStr < req.reception.today) throw httpError(422, 'Next follow-up date cannot be in the past');
}

function buildWhere(req, q = {}) {
  const { schoolId } = req;
  const { tz, today } = req.reception;
  const where = { schoolId };
  const and = [];

  if (q.stage === 'open') where.stage = { notIn: CLOSED_STAGES };
  else if (STAGES.includes(q.stage)) where.stage = q.stage;

  if (SOURCES.includes(q.source)) where.source = q.source;
  if (PRIORITIES.includes(q.priority)) where.priority = q.priority;
  if (q.classSought) where.classSought = { equals: String(q.classSought).trim(), mode: 'insensitive' };

  if (q.assignedToId === 'unassigned') where.assignedToId = null;
  else if (q.assignedToId === 'me') where.assignedToId = req.user.id;
  else if (UUID_RE.test(String(q.assignedToId || ''))) where.assignedToId = q.assignedToId;

  const from = S.safeDate(q.from);
  const to = S.safeDate(q.to);
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: S.dayStart(q.from, tz) } : {}),
      ...(to ? { lt: S.dayStart(S.addDaysStr(q.to, 1), tz) } : {}),
    };
  }

  if (['today', 'overdue', 'upcoming', 'none'].includes(q.followUp)) {
    const t = S.toDateOnly(today);
    and.push({ stage: { notIn: CLOSED_STAGES } });
    if (q.followUp === 'today') and.push({ nextFollowUpOn: t });
    else if (q.followUp === 'overdue') and.push({ nextFollowUpOn: { lt: t } });
    else if (q.followUp === 'upcoming') and.push({ nextFollowUpOn: { gt: t } });
    else and.push({ nextFollowUpOn: null });
  }

  const s = String(q.search || '').trim();
  if (s) {
    const digits = S.normalizePhone(s);
    and.push({
      OR: [
        { studentName: { contains: s, mode: 'insensitive' } },
        { parentName: { contains: s, mode: 'insensitive' } },
        { enquiryNo: { contains: s, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { altPhone: { contains: digits } }] : []),
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}

// ───────── list / detail ─────────
const listEnquiries = asyncHandler(async (req, res) => {
  const q = req.query;
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25));
  const where = buildWhere(req, q);
  const orderBy = q.sort === 'followUp'
    ? [{ nextFollowUpOn: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }];

  const [rows, total, grouped] = await Promise.all([
    prisma.enquiry.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.enquiry.count({ where }),
    prisma.enquiry.groupBy({ by: ['stage'], where: buildWhere(req, { ...q, stage: undefined }), _count: { _all: true } }),
  ]);

  const names = await S.namesById(req.schoolId, rows.map((r) => r.assignedToId));
  const stageCounts = Object.fromEntries(STAGES.map((st) => [st, 0]));
  grouped.forEach((g) => { stageCounts[g.stage] = g._count._all; });

  return ApiResponse.success(res, 200, 'Enquiries fetched', {
    enquiries: rows.map((r) => ({ ...serialize(r), assignedToName: names[r.assignedToId] || null })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    stageCounts,
  });
});

const getEnquiry = asyncHandler(async (req, res) => {
  const e = await prisma.enquiry.findFirst({
    where: { id: req.params.id, schoolId: req.schoolId },
    include: { followUps: { orderBy: { createdAt: 'desc' }, take: 200 } },
  });
  if (!e) return ApiResponse.error(res, 404, 'Enquiry not found');

  const names = await S.namesById(req.schoolId, [e.assignedToId, e.createdById]);
  const student = e.convertedStudentId
    ? await prisma.student.findFirst({
        where: { id: e.convertedStudentId, schoolId: req.schoolId },
        select: { id: true, name: true, enrollmentNumber: true },
      })
    : null;

  const { followUps, ...rest } = e;
  return ApiResponse.success(res, 200, 'Enquiry fetched', {
    ...serialize(rest),
    followUps: followUps.map(serializeFollowUp),
    assignedToName: names[e.assignedToId] || null,
    createdByName: names[e.createdById] || null,
    student,
  });
});

// ───────── create / update ─────────
const createEnquiry = asyncHandler(async (req, res) => {
  const data = V.createEnquirySchema.parse(req.body);
  const { schoolId } = req;

  assertNotPast(req, data.nextFollowUpOn);
  const assignedToId = data.assignedToId || req.user.id; // default: whoever logs it owns it
  if (data.assignedToId) await S.assertAssignee(schoolId, data.assignedToId);

  const fields = await S.loadFields(prisma, schoolId, 'enquiry');
  const customData = S.validateCustomData(fields, data.customData);

  if (!data.force) {
    const duplicates = await prisma.enquiry.findMany({
      where: {
        schoolId,
        stage: { notIn: CLOSED_STAGES },
        OR: [{ phone: data.phone }, { altPhone: data.phone }],
      },
      select: { id: true, enquiryNo: true, studentName: true, classSought: true, stage: true },
      take: 5,
    });
    if (duplicates.length) {
      return ApiResponse.error(res, 409, 'An open enquiry already exists for this phone number', { duplicates });
    }
  }

  // A parent who already has a child in the school is a warm lead: tell the desk.
  const siblings = await prisma.student.findMany({
    where: {
      schoolId,
      status: 'active',
      OR: [{ parentPhone: { contains: data.phone } }, { secondaryParentPhone: { contains: data.phone } }],
    },
    select: { id: true, name: true },
    take: 5,
  });

  await S.ensureCounter(schoolId, 'enquiry');
  const source = data.source ?? 'walk_in';

  const enquiry = await prisma.$transaction(async (tx) => {
    const seq = await S.nextNumber(tx, schoolId, 'enquiry');
    const row = await tx.enquiry.create({
      data: {
        schoolId,
        enquirySeq: seq,
        enquiryNo: `ENQ-${String(seq).padStart(5, '0')}`,
        studentName: data.studentName,
        dob: data.dob ? S.toDateOnly(data.dob) : null,
        gender: data.gender ?? null,
        classSought: data.classSought,
        academicYear: data.academicYear ?? null,
        parentName: data.parentName,
        phone: data.phone,
        altPhone: data.altPhone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        previousSchool: data.previousSchool ?? null,
        source,
        referredBy: data.referredBy ?? null,
        priority: data.priority ?? 'medium',
        notes: data.notes ?? null,
        customData,
        assignedToId,
        nextFollowUpOn: data.nextFollowUpOn ? S.toDateOnly(data.nextFollowUpOn) : null,
        createdById: req.user.id,
      },
    });
    await tx.enquiryFollowUp.create({
      data: {
        schoolId,
        enquiryId: row.id,
        kind: 'created',
        note: `Enquiry created (${SOURCE_LABEL[source] || source})`,
        toStage: 'new_lead',
        nextFollowUpOn: row.nextFollowUpOn,
        doneById: req.user.id,
        doneByName: req.user.name,
      },
    });
    return row;
  });

  await logAudit({ req, action: 'CREATE_ENQUIRY', resourceType: 'enquiry', resourceId: enquiry.id, metadata: { enquiryNo: enquiry.enquiryNo } });
  return ApiResponse.success(res, 201, `Enquiry ${enquiry.enquiryNo} created`, { enquiry: serialize(enquiry), siblings });
});

const updateEnquiry = asyncHandler(async (req, res) => {
  const data = V.updateEnquirySchema.parse(req.body);
  const existing = await findOwn(req);
  if (!existing) return ApiResponse.error(res, 404, 'Enquiry not found');
  if (existing.stage === 'admitted') throw httpError(409, 'This enquiry is admitted and locked');

  const patch = {};
  ['studentName', 'gender', 'classSought', 'academicYear', 'parentName', 'phone', 'altPhone', 'email',
    'address', 'previousSchool', 'source', 'referredBy', 'priority', 'notes'].forEach((k) => {
    if (data[k] !== undefined) patch[k] = data[k];
  });

  if (data.dob !== undefined) patch.dob = data.dob ? S.toDateOnly(data.dob) : null;

  if (data.nextFollowUpOn !== undefined && existing.stage !== 'lost') {
    // An unchanged (possibly overdue) date is fine; only a *new* past date is rejected.
    if (data.nextFollowUpOn !== S.toDateStr(existing.nextFollowUpOn)) assertNotPast(req, data.nextFollowUpOn);
    patch.nextFollowUpOn = data.nextFollowUpOn ? S.toDateOnly(data.nextFollowUpOn) : null;
  }

  if (data.assignedToId !== undefined) {
    if (data.assignedToId) await S.assertAssignee(req.schoolId, data.assignedToId);
    patch.assignedToId = data.assignedToId;
  }

  if (data.customData !== undefined) {
    const fields = await S.loadFields(prisma, req.schoolId, 'enquiry');
    patch.customData = S.mergeCustomData(existing.customData, fields, S.validateCustomData(fields, data.customData));
  }

  if (!Object.keys(patch).length) return ApiResponse.success(res, 200, 'Nothing to update', serialize(existing));

  const updated = await prisma.enquiry.update({ where: { id: existing.id }, data: patch });
  await logAudit({ req, action: 'UPDATE_ENQUIRY', resourceType: 'enquiry', resourceId: existing.id, metadata: { fields: Object.keys(patch) } });
  return ApiResponse.success(res, 200, 'Enquiry updated', serialize(updated));
});

// ───────── stage / follow-ups ─────────
const changeStage = asyncHandler(async (req, res) => {
  const data = V.stageSchema.parse(req.body);
  const e = await findOwn(req);
  if (!e) return ApiResponse.error(res, 404, 'Enquiry not found');

  if (e.stage === 'admitted') throw httpError(409, 'This enquiry is already admitted and locked');
  if (data.stage === 'admitted') throw httpError(422, 'Use "Convert to student" to mark an enquiry as admitted');
  if (data.stage === e.stage) throw httpError(409, 'Enquiry is already in this stage');
  if (data.stage === 'lost' && !data.lostReason) throw httpError(422, 'Please select a reason for marking this enquiry lost');

  let next = e.nextFollowUpOn;
  if (data.stage === 'lost') next = null;
  else if (data.nextFollowUpOn !== undefined) {
    assertNotPast(req, data.nextFollowUpOn);
    next = data.nextFollowUpOn ? S.toDateOnly(data.nextFollowUpOn) : null;
  }

  const note = [data.stage === 'lost' ? `Reason: ${data.lostReason}` : null, data.note].filter(Boolean).join(' · ') || null;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.enquiry.update({
      where: { id: e.id },
      data: { stage: data.stage, lostReason: data.stage === 'lost' ? data.lostReason : null, nextFollowUpOn: next },
    });
    await tx.enquiryFollowUp.create({
      data: {
        schoolId: req.schoolId, enquiryId: e.id, kind: 'stage_change', note,
        fromStage: e.stage, toStage: data.stage, nextFollowUpOn: next,
        doneById: req.user.id, doneByName: req.user.name,
      },
    });
    return row;
  });

  await logAudit({ req, action: 'ENQUIRY_STAGE_CHANGE', resourceType: 'enquiry', resourceId: e.id, metadata: { from: e.stage, to: data.stage } });
  return ApiResponse.success(res, 200, 'Stage updated', serialize(updated));
});

const addFollowUp = asyncHandler(async (req, res) => {
  const data = V.followUpSchema.parse(req.body);
  const e = await findOwn(req);
  if (!e) return ApiResponse.error(res, 404, 'Enquiry not found');
  if (e.stage === 'admitted') throw httpError(409, 'This enquiry is admitted and locked');
  if (e.stage === 'lost') throw httpError(409, 'Reopen this enquiry (change its stage) before adding follow-ups');
  assertNotPast(req, data.nextFollowUpOn);

  const isContact = data.kind !== 'note';
  const patch = {};
  if (isContact) patch.lastContactedAt = new Date();
  if (data.nextFollowUpOn !== undefined) patch.nextFollowUpOn = data.nextFollowUpOn ? S.toDateOnly(data.nextFollowUpOn) : null;

  let toStage = e.stage;
  if (data.stage) toStage = data.stage;
  else if (isContact && e.stage === 'new_lead') toStage = 'follow_up';
  const moved = toStage !== e.stage;
  if (moved) patch.stage = toStage;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.enquiry.update({ where: { id: e.id }, data: patch });
    await tx.enquiryFollowUp.create({
      data: {
        schoolId: req.schoolId, enquiryId: e.id, kind: data.kind, note: data.note,
        fromStage: moved ? e.stage : null, toStage: moved ? toStage : null,
        nextFollowUpOn: 'nextFollowUpOn' in patch ? patch.nextFollowUpOn : null,
        doneById: req.user.id, doneByName: req.user.name,
      },
    });
    return row;
  });

  await logAudit({ req, action: 'ENQUIRY_FOLLOWUP', resourceType: 'enquiry', resourceId: e.id, metadata: { kind: data.kind } });
  return ApiResponse.success(res, 201, 'Follow-up saved', serialize(updated));
});

// Follow-up board: overdue / today / next 7 days / nothing scheduled
const getFollowUps = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const { today } = req.reception;
  const q = req.query;

  const base = { schoolId, stage: { notIn: CLOSED_STAGES } };
  if (q.assignedToId === 'me') base.assignedToId = req.user.id;
  else if (UUID_RE.test(String(q.assignedToId || ''))) base.assignedToId = q.assignedToId;

  const t = S.toDateOnly(today);
  const week = S.toDateOnly(S.addDaysStr(today, 7));
  const sel = { orderBy: [{ nextFollowUpOn: 'asc' }, { createdAt: 'asc' }], take: 200 };

  const [overdue, dueToday, upcoming, unscheduled] = await Promise.all([
    prisma.enquiry.findMany({ where: { ...base, nextFollowUpOn: { lt: t } }, ...sel }),
    prisma.enquiry.findMany({ where: { ...base, nextFollowUpOn: t }, ...sel }),
    prisma.enquiry.findMany({ where: { ...base, nextFollowUpOn: { gt: t, lte: week } }, ...sel }),
    prisma.enquiry.findMany({ where: { ...base, nextFollowUpOn: null }, orderBy: { createdAt: 'asc' }, take: 100 }),
  ]);

  const all = [...overdue, ...dueToday, ...upcoming, ...unscheduled];
  const names = await S.namesById(schoolId, all.map((r) => r.assignedToId));
  const shape = (rows) => rows.map((r) => ({ ...serialize(r), assignedToName: names[r.assignedToId] || null }));

  return ApiResponse.success(res, 200, 'Follow-ups fetched', {
    today,
    overdue: shape(overdue),
    today_: shape(dueToday),
    upcoming: shape(upcoming),
    unscheduled: shape(unscheduled),
  });
});

// ───────── convert to student (admin only) ─────────
const getConvertOptions = asyncHandler(async (req, res) => {
  const { schoolId } = req;
  const sessions = await prisma.academicSession.findMany({
    where: { schoolId }, orderBy: { startDate: 'desc' }, select: { id: true, label: true, isActive: true },
  });
  const sessionId = req.query.sessionId || (sessions.find((s) => s.isActive) || sessions[0] || {}).id || null;
  const classes = sessionId
    ? await prisma.class.findMany({
        where: { schoolId, sessionId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sections: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
      })
    : [];
  return ApiResponse.success(res, 200, 'Options fetched', { sessions, sessionId, classes });
});

const convertEnquiry = asyncHandler(async (req, res) => {
  const data = V.convertSchema.parse(req.body);
  const { schoolId } = req;

  const e = await findOwn(req);
  if (!e) return ApiResponse.error(res, 404, 'Enquiry not found');
  if (e.convertedStudentId || e.stage === 'admitted') throw httpError(409, 'This enquiry is already converted');
  if (e.stage === 'lost') throw httpError(409, 'Reopen this enquiry (change its stage) before converting it');

  const [session, cls, section] = await Promise.all([
    prisma.academicSession.findFirst({ where: { id: data.sessionId, schoolId } }),
    prisma.class.findFirst({ where: { id: data.classId, schoolId, sessionId: data.sessionId } }),
    prisma.section.findFirst({ where: { id: data.sectionId, schoolId, classId: data.classId } }),
  ]);
  if (!session || !cls || !section) throw httpError(422, 'Selected session, class and section do not match');

  const clash = await prisma.student.findUnique({
    where: { schoolId_enrollmentNumber: { schoolId, enrollmentNumber: data.enrollmentNumber } },
  });
  if (clash) throw httpError(409, 'A student with this enrollment number already exists');

  const result = await prisma.$transaction(async (tx) => {
    // Claim the enquiry first: a double-click / second tab loses the race and gets a clean 409.
    const claimed = await tx.enquiry.updateMany({
      where: { id: e.id, schoolId, convertedStudentId: null, stage: { not: 'admitted' } },
      data: { stage: 'admitted', convertedAt: new Date(), nextFollowUpOn: null, lostReason: null },
    });
    if (claimed.count === 0) throw httpError(409, 'This enquiry was already converted');

    const student = await tx.student.create({
      data: {
        schoolId,
        name: e.studentName,
        dob: e.dob,
        gender: e.gender,
        parentName: e.parentName,
        parentEmail: data.parentEmail || e.email || null,
        parentPhone: e.phone,
        secondaryParentPhone: e.altPhone,
        address: e.address,
        admissionDate: S.toDateOnly(data.admissionDate || req.reception.today),
        enrollmentNumber: data.enrollmentNumber,
        status: 'active',
      },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id, sessionId: data.sessionId, classId: data.classId,
        sectionId: data.sectionId, rollNumber: data.rollNumber ?? null, status: 'active',
      },
    });
    await tx.enquiry.update({ where: { id: e.id }, data: { convertedStudentId: student.id } });
    await tx.enquiryFollowUp.create({
      data: {
        schoolId, enquiryId: e.id, kind: 'converted',
        note: `Admitted as ${student.name} (${data.enrollmentNumber}) in ${cls.name} ${section.name}`,
        fromStage: e.stage, toStage: 'admitted',
        doneById: req.user.id, doneByName: req.user.name,
      },
    });
    return { student, enrollment };
  });

  await logAudit({ req, action: 'CONVERT_ENQUIRY', resourceType: 'enquiry', resourceId: e.id, metadata: { studentId: result.student.id, enquiryNo: e.enquiryNo } });
  return ApiResponse.success(res, 201, 'Enquiry converted to student', result);
});

// ───────── delete (admin only) / export ─────────
const deleteEnquiry = asyncHandler(async (req, res) => {
  const e = await findOwn(req);
  if (!e) return ApiResponse.error(res, 404, 'Enquiry not found');
  await prisma.enquiry.delete({ where: { id: e.id } });
  await logAudit({ req, action: 'DELETE_ENQUIRY', resourceType: 'enquiry', resourceId: e.id, metadata: { enquiryNo: e.enquiryNo, studentName: e.studentName } });
  return ApiResponse.success(res, 200, 'Enquiry deleted');
});

const exportCsv = asyncHandler(async (req, res) => {
  const { tz } = req.reception;
  const rows = await prisma.enquiry.findMany({
    where: buildWhere(req, req.query),
    orderBy: { createdAt: 'asc' },
    take: 20000,
  });
  const names = await S.namesById(req.schoolId, rows.map((r) => r.assignedToId));
  const out = rows.map((r) => ({
    'Enquiry No': r.enquiryNo,
    Date: new Date(r.createdAt).toLocaleDateString('en-CA', { timeZone: tz }),
    Student: r.studentName,
    'Class Sought': r.classSought,
    'Academic Year': r.academicYear || '',
    Parent: r.parentName,
    Phone: r.phone,
    'Alt Phone': r.altPhone || '',
    Email: r.email || '',
    Source: SOURCE_LABEL[r.source] || r.source,
    'Referred By': r.referredBy || '',
    Priority: r.priority,
    Stage: r.stage,
    'Lost Reason': r.lostReason || '',
    'Next Follow-up': S.toDateStr(r.nextFollowUpOn) || '',
    'Last Contacted': r.lastContactedAt ? new Date(r.lastContactedAt).toLocaleDateString('en-CA', { timeZone: tz }) : '',
    'Assigned To': names[r.assignedToId] || '',
  }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="enquiries.csv"');
  return res.send(`\uFEFF${stringify(out, { header: true })}`);
});

module.exports = {
  listEnquiries, getEnquiry, createEnquiry, updateEnquiry, changeStage, addFollowUp, getFollowUps,
  getConvertOptions, convertEnquiry, deleteEnquiry, exportCsv,
};