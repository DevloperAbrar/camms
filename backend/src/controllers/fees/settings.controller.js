const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { settingsSchema } = require('../../validators/fee.validator');
const { normalizeSettings, toDateStr } = require('../../services/fee.service');

function serializeSettings(s) {
  const { logoData, ...rest } = s;
  return {
    ...rest,
    hasLogo: !!logoData,
    logoDataUrl: logoData ? `data:${s.logoMime || 'image/png'};base64,${Buffer.from(logoData).toString('base64')}` : null,
  };
}

// One call that bootstraps every fee screen (both roles)
const getMeta = asyncHandler(async (req, res) => {
  const { school, settings, today } = req.fee;
  const isAdmin = req.user.role === 'admin';

  const [sessions, classes, heads] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, isActive: true, startDate: true, endDate: true },
    }),
    prisma.class.findMany({
      where: { schoolId: req.schoolId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, sessionId: true, sections: { select: { id: true, name: true }, orderBy: { name: 'asc' } } },
    }),
    prisma.feeHead.findMany({
      where: { schoolId: req.schoolId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, gstRate: true },
    }),
  ]);

  const active = sessions.find((s) => s.isActive) || sessions[0] || null;

  return ApiResponse.success(res, 200, 'Fee meta fetched', {
    school: { name: settings.displayName || school.name },
    user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    today,
    activeSessionId: active ? active.id : null,
    sessions: sessions.map((s) => ({ ...s, startDate: toDateStr(s.startDate), endDate: toDateStr(s.endDate) })),
    classes,
    heads: heads.map((h) => ({ ...h, gstRate: Number(h.gstRate) })),
    settings: {
      enabledModes: settings.enabledModes,
      lateFeeMode: settings.lateFeeMode,
      gstEnabled: settings.gstEnabled,
      copiesPerReceipt: settings.copiesPerReceipt,
      collectorCanConcede: settings.collectorCanConcede,
      hasLogo: !!settings.logoData,
    },
    permissions: {
      isAdmin,
      canConcede: isAdmin || settings.collectorCanConcede,
      canBackdate: isAdmin,
      canCancelReceipt: isAdmin,
    },
  });
});

const getSettings = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, 200, 'Settings fetched', serializeSettings(req.fee.settings));
});

const updateSettings = asyncHandler(async (req, res) => {
  const parsed = settingsSchema.parse(req.body);

  // '' -> null so cleared fields are really cleared
  const data = {};
  Object.entries(parsed).forEach(([k, v]) => { if (v !== undefined) data[k] = v === '' ? null : v; });

  const next = { ...req.fee.settings, ...data };
  if (next.gstEnabled && !next.gstin) {
    return ApiResponse.error(res, 422, 'Enter your GSTIN to enable GST on receipts');
  }

  const updated = await prisma.feeSettings.update({ where: { schoolId: req.schoolId }, data });
  await logAudit({ req, action: 'UPDATE_FEE_SETTINGS', resourceType: 'fee_settings', resourceId: updated.id, metadata: { fields: Object.keys(data) } });

  return ApiResponse.success(res, 200, 'Settings saved', serializeSettings(normalizeSettings(updated)));
});

// PNG / JPEG only: the formats the receipt PDF engine can embed.
const isPng = (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) return ApiResponse.error(res, 422, 'No logo file uploaded');

  const buf = req.file.buffer;
  const mime = isPng(buf) ? 'image/png' : isJpeg(buf) ? 'image/jpeg' : null;
  if (!mime) return ApiResponse.error(res, 422, 'Logo must be a PNG or JPG image');

  const updated = await prisma.feeSettings.update({ where: { schoolId: req.schoolId }, data: { logoData: buf, logoMime: mime } });
  await logAudit({ req, action: 'UPLOAD_FEE_LOGO', resourceType: 'fee_settings', resourceId: updated.id });

  return ApiResponse.success(res, 200, 'Logo saved', serializeSettings(normalizeSettings(updated)));
});

const removeLogo = asyncHandler(async (req, res) => {
  const updated = await prisma.feeSettings.update({ where: { schoolId: req.schoolId }, data: { logoData: null, logoMime: null } });
  await logAudit({ req, action: 'REMOVE_FEE_LOGO', resourceType: 'fee_settings', resourceId: updated.id });
  return ApiResponse.success(res, 200, 'Logo removed', serializeSettings(normalizeSettings(updated)));
});

module.exports = { getMeta, getSettings, updateSettings, uploadLogo, removeLogo };