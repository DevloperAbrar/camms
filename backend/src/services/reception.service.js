const { prisma } = require('../config/db');
const httpError = require('../utils/httpError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayInTz(tz = 'Asia/Kolkata') {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const toDateOnly = (str) => new Date(`${str}T00:00:00.000Z`);
const safeDate = (str) => (typeof str === 'string' && DATE_RE.test(str) ? toDateOnly(str) : undefined);
const toDateStr = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function addDaysStr(str, n) {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Indian mobile: strips +91 / 0 prefixes and non-digits
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

// ───────── timezone-aware day boundaries (visitor timestamps are real instants) ─────────
function tzOffsetMs(tz, at) {
  try {
    const whole = new Date(Math.floor(at.getTime() / 1000) * 1000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(whole);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - whole.getTime();
  } catch {
    return 0;
  }
}

// Start (00:00 local) of the given YYYY-MM-DD in the school's timezone, as a UTC instant
function dayStart(dateStr, tz = 'Asia/Kolkata') {
  const guess = new Date(`${dateStr}T00:00:00.000Z`);
  return new Date(guess.getTime() - tzOffsetMs(tz, guess));
}

// ───────── numbering (row-locked increment; no gaps from races) ─────────
async function ensureCounter(schoolId, kind) {
  try {
    await prisma.receptionCounter.upsert({
      where: { schoolId_kind: { schoolId, kind } },
      create: { schoolId, kind, lastNumber: 0 },
      update: {},
    });
  } catch (err) {
    if (err.code !== 'P2002') throw err; // another request created it first: fine
  }
}

async function nextNumber(tx, schoolId, kind) {
  const row = await tx.receptionCounter.update({
    where: { schoolId_kind: { schoolId, kind } },
    data: { lastNumber: { increment: 1 } },
  });
  return row.lastNumber;
}

// ───────── custom fields ─────────
function slugKey(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'field';
}

function loadFields(client, schoolId, scope, { includeInactive = false } = {}) {
  return client.receptionField.findMany({
    where: { schoolId, scope, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

// Validates the submitted values against the school's active fields. Returns only clean values.
function validateCustomData(fields, input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const f of fields) {
    const v = src[f.key];

    if (f.type === 'checkbox') {
      if (v === true || v === 'true') out[f.key] = true;
      else if (f.isRequired) throw httpError(422, `${f.label} is required`);
      continue;
    }

    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (f.isRequired) throw httpError(422, `${f.label} is required`);
      continue;
    }

    switch (f.type) {
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw httpError(422, `${f.label} must be a number`);
        out[f.key] = n;
        break;
      }
      case 'date':
        if (typeof v !== 'string' || !DATE_RE.test(v)) throw httpError(422, `${f.label} must be a valid date`);
        out[f.key] = v;
        break;
      case 'select': {
        const opts = Array.isArray(f.options) ? f.options : [];
        if (!opts.includes(String(v))) throw httpError(422, `${f.label}: choose one of the listed options`);
        out[f.key] = String(v);
        break;
      }
      case 'textarea':
        if (String(v).length > 1000) throw httpError(422, `${f.label} is too long (max 1000 characters)`);
        out[f.key] = String(v).trim();
        break;
      default:
        if (String(v).length > 200) throw httpError(422, `${f.label} is too long (max 200 characters)`);
        out[f.key] = String(v).trim();
    }
  }
  return out;
}

// Keeps values of fields the admin has since deactivated/deleted; active fields reflect the new submission.
function mergeCustomData(existing, activeFields, cleaned) {
  const base = { ...(existing && typeof existing === 'object' ? existing : {}) };
  for (const f of activeFields) delete base[f.key];
  return { ...base, ...cleaned };
}

// ───────── staff helpers ─────────
async function assertAssignee(schoolId, userId) {
  const u = await prisma.user.findFirst({
    where: { id: userId, schoolId, role: { in: ['admin', 'receptionist'] }, status: 'active' },
    select: { id: true },
  });
  if (!u) throw httpError(422, 'Selected staff member was not found');
}

async function namesById(schoolId, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const users = await prisma.user.findMany({ where: { id: { in: unique }, schoolId }, select: { id: true, name: true } });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}

module.exports = {
  todayInTz, toDateOnly, safeDate, toDateStr, addDaysStr, normalizePhone, dayStart,
  ensureCounter, nextNumber, slugKey, loadFields, validateCustomData, mergeCustomData,
  assertAssignee, namesById,
};