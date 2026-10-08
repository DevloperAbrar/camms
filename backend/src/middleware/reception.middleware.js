const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const { todayInTz } = require('../services/reception.service');

// Plan gate. Reception is ON for every plan unless the plan's features JSON has `reception: false`.
// (To sell it as a paid add-on, change the check to `features.reception !== true`.)
async function requireReceptionModule(req, res, next) {
  try {
    const sub = await prisma.schoolSubscription.findFirst({
      where: { schoolId: req.schoolId },
      orderBy: { endDate: 'desc' },
      include: { plan: { select: { features: true } } },
    });
    const features = (sub && sub.plan && sub.plan.features) || {};
    if (features.reception === false) {
      return ApiResponse.error(res, 403, 'Reception (Enquiries & Visitors) is not included in your current plan. Please contact support to upgrade.');
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Loads the school once per request and works out "today" in the school's timezone.
async function receptionContext(req, res, next) {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId } });
    if (!school) return ApiResponse.error(res, 404, 'School not found');
    const tz = school.timezone || 'Asia/Kolkata';
    req.reception = { school, tz, today: todayInTz(tz) };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireReceptionModule, receptionContext };