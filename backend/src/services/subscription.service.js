const { prisma } = require('../config/db');
const { createBulkNotifications } = require('./notification.service');
const constants = require('../config/constants');

async function checkAndFlagExpiredSchools() {
  const now = new Date();

  const activeSubs = await prisma.schoolSubscription.findMany({
    where: { status: { in: ['active', 'trial'] } },
    include: { school: true },
  });

  let expiredCount = 0;

  for (const sub of activeSubs) {
    const graceDeadline = new Date(sub.endDate);
    graceDeadline.setDate(graceDeadline.getDate() + constants.GRACE_PERIOD_DAYS);

    if (now > graceDeadline) {
      await prisma.$transaction([
        prisma.schoolSubscription.update({ where: { id: sub.id }, data: { status: 'expired' } }),
        prisma.school.update({ where: { id: sub.schoolId }, data: { status: 'expired' } }),
      ]);
      expiredCount++;
    }
  }

  return { checked: activeSubs.length, expired: expiredCount };
}

async function sendRenewalReminders() {
  const now = new Date();
  const reminderWindows = [30, 15, 7, 1];
  let sentCount = 0;

  const activeSubs = await prisma.schoolSubscription.findMany({
    where: { status: { in: ['active', 'trial'] } },
    include: { school: true },
  });

  for (const sub of activeSubs) {
    const daysLeft = Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24));

    if (reminderWindows.includes(daysLeft)) {
      const admins = await prisma.user.findMany({
        where: { schoolId: sub.schoolId, role: 'admin', status: 'active' },
        select: { id: true },
      });

      const notifications = admins.map((admin) => ({
        schoolId: sub.schoolId,
        recipientType: 'admin',
        recipientRef: admin.id,
        title: 'Subscription renewal due',
        message: `Your subscription expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Please renew soon.`,
        type: 'renewal_reminder',
      }));

      await createBulkNotifications(notifications);
      sentCount += notifications.length;
    }
  }

  return { checked: activeSubs.length, remindersSent: sentCount };
}

module.exports = { checkAndFlagExpiredSchools, sendRenewalReminders };