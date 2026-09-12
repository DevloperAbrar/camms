const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createPlanSchema, updatePlanSchema } = require('../../validators/superadmin.validator');

const createPlan = asyncHandler(async (req, res) => {
  const data = createPlanSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.create({ data });

  await logAudit({ req, action: 'CREATE_PLAN', resourceType: 'subscription_plan', resourceId: plan.id, metadata: data });

  return ApiResponse.success(res, 201, 'Plan created', plan);
});

const getPlans = asyncHandler(async (req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  return ApiResponse.success(res, 200, 'Plans fetched', plans);
});

const updatePlan = asyncHandler(async (req, res) => {
  const data = updatePlanSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.update({ where: { id: req.params.id }, data });

  await logAudit({ req, action: 'UPDATE_PLAN', resourceType: 'subscription_plan', resourceId: plan.id, metadata: data });

  return ApiResponse.success(res, 200, 'Plan updated', plan);
});

const deletePlan = asyncHandler(async (req, res) => {
  const inUse = await prisma.schoolSubscription.findFirst({ where: { planId: req.params.id } });
  if (inUse) {
    return ApiResponse.error(res, 409, 'Cannot delete a plan that is assigned to schools');
  }

  await prisma.subscriptionPlan.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_PLAN', resourceType: 'subscription_plan', resourceId: req.params.id });

  return ApiResponse.success(res, 200, 'Plan deleted');
});

module.exports = { createPlan, getPlans, updatePlan, deletePlan };