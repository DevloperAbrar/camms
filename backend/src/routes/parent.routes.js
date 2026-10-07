const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/shared/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { verifyChildAccess } = require('../middleware/parentAccess.middleware');

const childrenController = require('../controllers/parent/children.controller');
const attendanceController = require('../controllers/parent/attendance.controller');
const marksController = require('../controllers/parent/marks.controller');
const noticeController = require('../controllers/parent/notice.controller');
const feesController = require('../controllers/parent/fees.controller');
const calendarController = require('../controllers/shared/calendar.controller');
const syllabusController = require('../controllers/parent/syllabus.controller');

// Note: no enforceTenant/checkSubscriptionActive here — parent JWT has no schoolId.
// Access is scoped per-child instead, via verifyChildAccess on each route below.
router.use(authenticate, authorize('parent'));

router.get('/children', childrenController.getMyChildren);

router.get('/attendance/calendar', verifyChildAccess, attendanceController.getAttendanceCalendar);
router.get('/attendance/subject-wise', verifyChildAccess, attendanceController.getSubjectWiseAttendance);

router.get('/marks/by-exam-type', verifyChildAccess, marksController.getMarksByExamType);
router.get('/marks/report-card', verifyChildAccess, marksController.getConsolidatedReportCard);

router.get('/notices', verifyChildAccess, noticeController.getNoticesForChild);

// Academic Calendar (read-only, scoped to the child's class)
router.get('/calendar', verifyChildAccess, calendarController.getParentCalendar);
router.get('/calendar/export', verifyChildAccess, calendarController.exportParentCalendar);

// Syllabus coverage (read-only, scoped to the child's own section)
router.get('/syllabus', verifyChildAccess, syllabusController.getChildSyllabus);

// Fees (read-only for parents)
router.get('/fees', verifyChildAccess, feesController.getChildFees);
router.get('/fees/statement-pdf', verifyChildAccess, feesController.statementPdf);
router.get('/fees/receipts/:receiptId/pdf', verifyChildAccess, feesController.receiptPdf);


router.get('/notifications', notificationController.listMyNotifications);
router.patch('/notifications/:id/read', notificationController.markNotificationRead);
router.patch('/notifications/read-all', notificationController.markAllNotificationsRead);

module.exports = router;