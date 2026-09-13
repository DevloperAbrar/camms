const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { enforceTenant } = require('../middleware/tenant.middleware');
const { checkSubscriptionActive } = require('../middleware/subscription.middleware');

const dashboardController = require('../controllers/faculty/dashboard.controller');
const attendanceController = require('../controllers/faculty/attendance.controller');
const marksController = require('../controllers/faculty/marks.controller');
const correctionController = require('../controllers/faculty/correction.controller');
const analyticsController = require('../controllers/faculty/analytics.controller');
const reportsController = require('../controllers/faculty/reports.controller');

const notificationController = require('../controllers/shared/notification.controller');

router.use(authenticate, authorize('faculty'), enforceTenant, checkSubscriptionActive);

// Dashboard
router.get('/dashboard', dashboardController.getDashboard);

// Attendance
router.get('/attendance/my-assignments', attendanceController.getMyAssignments);
router.get('/attendance/roster', attendanceController.getRosterForAttendance);
router.post('/attendance/mark', attendanceController.markAttendance);
router.get('/attendance/history', attendanceController.getMyAttendanceHistory);

// Marks
router.get('/marks/exam-subjects', marksController.getMyExamSubjects);
router.get('/marks/roster', marksController.getRosterForMarks);
router.post('/marks/enter', marksController.enterMarks);
router.get('/marks/class-average', marksController.getMyClassAverage);

// Analytics
router.get('/analytics/overview',           analyticsController.getOverview);
router.get('/analytics/daily',              analyticsController.getDailyAttendance);
router.get('/analytics/weekly',             analyticsController.getWeeklyAttendance);
router.get('/analytics/trend',              analyticsController.getAttendanceTrend);
router.get('/analytics/students',           analyticsController.getStudentStats);
router.get('/analytics/marks-summary',      analyticsController.getMarksSummary);
router.get('/analytics/section-comparison', analyticsController.getSectionComparison);

// Reports — Attendance Report, Marks Report, Student Report Card.
// Class teachers get all-subject visibility here; see facultyScope.service.js
router.get('/reports/attendance',      reportsController.getMyAttendanceReport);
router.get('/reports/exam-types',      reportsController.getMyExamTypes);
router.get('/reports/subjects',        reportsController.getMySubjectsForReports);
router.get('/reports/marks',           reportsController.getMyMarksReport);
router.get('/reports/students',        reportsController.getMyStudentsForReports);
router.get('/reports/report-card',     reportsController.getMyStudentReportCard);
router.get('/reports/report-card-pdf', reportsController.downloadMyStudentReportCardPDF);

// Corrections
router.post('/corrections/request', correctionController.requestCorrection);
router.get('/corrections/my-requests', correctionController.getMyCorrectionRequests);

// Notifications (in-app)
router.get('/notifications', notificationController.listMyNotifications);
router.patch('/notifications/:id/read', notificationController.markNotificationRead);
router.patch('/notifications/read-all', notificationController.markAllNotificationsRead);

module.exports = router;