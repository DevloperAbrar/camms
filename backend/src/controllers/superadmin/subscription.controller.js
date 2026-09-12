const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { renewSubscriptionSchema } = require('../../validators/superadmin.validator');

const renewSubscription = asyncHandler(async (req, res) => {
  const data = renewSubscriptionSchema.parse(req.body);

  const subscription = await prisma.schoolSubscription.findUnique({
    where: { id: req.params.id },
  });

  if (!subscription) return ApiResponse.error(res, 404, 'Subscription not found');

  const previousEndDate = subscription.endDate;
  let newEndDate;

  if (data.newEndDate) {
    newEndDate = new Date(data.newEndDate);
  } else {
    newEndDate = new Date(previousEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + (data.extendMonths || 12));
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedSub = await tx.schoolSubscription.update({
      where: { id: subscription.id },
      data: { endDate: newEndDate, status: 'active' },
    });

    const renewal = await tx.subscriptionRenewal.create({
      data: {
        subscriptionId: subscription.id,
        amount: data.amount,
        invoiceRef: data.invoiceRef,
        paymentMode: data.paymentMode,
        renewedBy: req.user.id,
        previousEndDate,
        newEndDate,
      },
    });

    await tx.school.update({
      where: { id: subscription.schoolId },
      data: { status: 'active' },
    });

    return { updatedSub, renewal };
  });

  await logAudit({
    req,
    action: 'RENEW_SUBSCRIPTION',
    resourceType: 'school_subscription',
    resourceId: subscription.id,
    metadata: { amount: data.amount, newEndDate },
  });

  return ApiResponse.success(res, 200, 'Subscription renewed', result);
});

const getRenewalHistory = asyncHandler(async (req, res) => {
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { subscriptionId: req.params.id },
    orderBy: { renewedAt: 'desc' },
  });
  return ApiResponse.success(res, 200, 'Renewal history fetched', renewals);
});

module.exports = { renewSubscription, getRenewalHistory };