const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { getNotifications, markAsRead, markAllAsRead } = require('../../services/notification.service');

const listMyNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly, page, limit } = req.query;

  // recipientRef resolution: parent -> a child's studentId must be passed; admin/faculty -> their own user id
  const recipientRef = req.user.role === 'parent' ? req.query.studentId : req.user.id;

  if (req.user.role === 'parent') {
    if (!recipientRef || !req.user.children.includes(recipientRef)) {
      return ApiResponse.error(res, 403, 'studentId is required and must belong to you');
    }
  }

  const result = await getNotifications({
    recipientRef,
    unreadOnly: unreadOnly === 'true',
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });

  return ApiResponse.success(res, 200, 'Notifications fetched', result);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const recipientRef = req.user.role === 'parent' ? req.body.studentId : req.user.id;

  await markAsRead(req.params.id, recipientRef);
  return ApiResponse.success(res, 200, 'Notification marked as read');
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const recipientRef = req.user.role === 'parent' ? req.body.studentId : req.user.id;

  await markAllAsRead(recipientRef);
  return ApiResponse.success(res, 200, 'All notifications marked as read');
});

module.exports = { listMyNotifications, markNotificationRead, markAllNotificationsRead };