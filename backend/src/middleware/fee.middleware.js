const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const { normalizeSettings, todayInTz } = require('../services/fee.service');

// Plan gate. Fee Management is ON for every plan unless the plan's features JSON has `feeManagement: false`.
// (To sell it as a paid add-on, change the check to `features.feeManagement !== true`.)
async function requireFeeModule(req, res, next) {
  try {
    const sub = await prisma.schoolSubscription.findFirst({
      where: { schoolId: req.schoolId },
      orderBy: { endDate: 'desc' },
      include: { plan: { select: { features: true } } },
    });
    const features = (sub && sub.plan && sub.plan.features) || {};
    if (features.feeManagement === false) {
      return ApiResponse.error(res, 403, 'Fee Management is not included in your current plan. Please contact support to upgrade.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Loads school + fee settings once per request and works out "today" in the school's timezone.
async function feeContext(req, res, next) {
  try {
    const [school, existing] = await Promise.all([
      prisma.school.findUnique({ where: { id: req.schoolId } }),
      prisma.feeSettings.findUnique({ where: { schoolId: req.schoolId } }),
    ]);
    if (!school) return ApiResponse.error(res, 404, 'School not found');

    const row = existing || (await prisma.feeSettings.upsert({
      where: { schoolId: req.schoolId },
      update: {},
      create: { schoolId: req.schoolId, displayName: school.name },
    }));

    const tz = school.timezone || 'Asia/Kolkata';
    req.fee = { school, settings: normalizeSettings(row), tz, today: todayInTz(tz) };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireFeeModule, feeContext };