const { prisma } = require('../config/db');

async function createNotification({ schoolId = null, recipientType, recipientRef, title, message, type }) {
  return prisma.notification.create({
    data: { schoolId, recipientType, recipientRef, title, message, type },
  });
}

async function createBulkNotifications(notifications) {
  if (notifications.length === 0) return { count: 0 };
  return prisma.notification.createMany({ data: notifications });
}

async function getNotifications({ recipientRef, unreadOnly = false, page = 1, limit = 20 }) {
  const where = { recipientRef, ...(unreadOnly ? { isRead: false } : {}) };

  const [notifications, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { recipientRef, isRead: false } }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, unreadCount, total, page, totalPages: Math.ceil(total / limit) };
}

async function markAsRead(notificationId, recipientRef) {
  return prisma.notification.updateMany({
    where: { id: notificationId, recipientRef },
    data: { isRead: true },
  });
}

async function markAllAsRead(recipientRef) {
  return prisma.notification.updateMany({
    where: { recipientRef, isRead: false },
    data: { isRead: true },
  });
}

module.exports = { createNotification, createBulkNotifications, getNotifications, markAsRead, markAllAsRead };