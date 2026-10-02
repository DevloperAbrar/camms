const express = require('express');
const multer = require('multer');
const router = express.Router();
const notificationController = require('../controllers/shared/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { enforceTenant } = require('../middleware/tenant.middleware');
const { checkSubscriptionActive } = require('../middleware/subscription.middleware');
const feeStaffController = require('../controllers/schooladmin/feestaff.controller');
const sessionController = require('../controllers/schooladmin/session.controller');
const classController = require('../controllers/schooladmin/class.controller');
const sectionController = require('../controllers/schooladmin/section.controller');
const subjectController = require('../controllers/schooladmin/subject.controller');
const facultyController = require('../controllers/schooladmin/faculty.controller');
const studentController = require('../controllers/schooladmin/student.controller');
const promotionController = require('../controllers/schooladmin/promotion.controller');
const examTypeController = require('../controllers/schooladmin/examtype.controller');
const marksOversightController = require('../controllers/schooladmin/marksoversight.controller');
const analyticsController = require('../controllers/schooladmin/analytics.controller');
const holidayController = require('../controllers/schooladmin/holiday.controller');
const correctionController = require('../controllers/schooladmin/correction.controller');
const reportCardController = require('../controllers/schooladmin/reportcard.controller');

const marksLockController = require('../controllers/schooladmin/markslock.controller');


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
});

// Every route: authenticated admin, tenant-scoped, subscription must be active
router.use(authenticate, authorize('admin'), enforceTenant, checkSubscriptionActive);

// Sessions
router.post('/sessions', sessionController.createSession);
router.get('/sessions', sessionController.getSessions);
router.post('/sessions/:id/activate', sessionController.activateSession);
router.patch('/sessions/:id', sessionController.updateSession);
router.delete('/sessions/:id', sessionController.deleteSession);

// Classes
router.post('/classes', classController.createClass);
router.get('/classes', classController.getClasses);
router.delete('/classes/:id', classController.deleteClass);
router.patch('/classes/:id', classController.updateClass);

// Sections
router.post('/sections', sectionController.createSection);
router.patch('/sections/:id', sectionController.updateSection);
router.delete('/sections/:id', sectionController.deleteSection);

// Subjects
router.post('/subjects', subjectController.createSubject);
router.get('/subjects', subjectController.getSubjects);
router.post('/subjects/copy', subjectController.copySubjects);
router.delete('/subjects/:id', subjectController.deleteSubject);
router.patch('/subjects/:id', subjectController.updateSubject);

// Faculty
router.post('/faculty', facultyController.createFaculty);
router.get('/faculty', facultyController.getFacultyList);
router.get('/faculty/assignments', facultyController.getFacultyAssignments);
router.post('/faculty/assignments', facultyController.assignFaculty);
router.delete('/faculty/assignments/:id', facultyController.removeFacultyAssignment);
router.patch('/faculty/:id', facultyController.updateFaculty);
router.post('/faculty/:id/deactivate', facultyController.deactivateFaculty);
router.post('/faculty/:id/reset-password', facultyController.resetFacultyPassword);
router.patch('/faculty/assignments/:id', facultyController.updateFacultyAssignment);

// Students
router.post('/students', studentController.createStudent);
router.get('/students', studentController.getStudents);
router.get('/students/csv-template', studentController.getCsvTemplate);
router.post('/students/csv-preview', upload.single('file'), studentController.previewCsvUpload);
router.post('/students/csv-commit', studentController.commitCsvUpload);
router.patch('/students/:id', studentController.updateStudent);
router.post('/students/:id/deactivate', studentController.deactivateStudent);
router.delete('/students/:id', studentController.deleteStudent);

// Promotion / Rollover
router.get('/promotion/roster', promotionController.getPromotionRoster);
router.post('/promotion/run', promotionController.runPromotion);

// Exam Types & Marks Configuration
router.post('/exam-types', examTypeController.createExamType);
router.get('/exam-types', examTypeController.getExamTypes);
router.post('/exam-types/copy', examTypeController.copyExamConfig);
router.patch('/exam-types/:id', examTypeController.updateExamType);
router.delete('/exam-types/:id', examTypeController.deleteExamType);
router.post('/exam-types/subjects', examTypeController.addExamSubject);
router.patch('/exam-types/subjects/:id', examTypeController.updateExamSubject);
router.post('/exam-types/:id/copy-subjects', examTypeController.copyExamSubjects);
router.post('/exam-types/:id/force-unlock', examTypeController.forceUnlockExamType);

// Marks Oversight
router.get('/marks/exam-subject/:examSubjectId', marksOversightController.getMarksForExamSubject);
router.patch('/marks/:id/override', marksOversightController.overrideMark);
// Marks Lock/Unlock (dynamic, bulk, per Class + Subject + Exam Type)
router.get('/marks-lock/overview',                              marksLockController.getLockOverview);
router.patch('/marks-lock/exam-subject/:examSubjectId',         marksLockController.setLockStatus);
router.post('/marks-lock/bulk-by-class',                        marksLockController.bulkSetByClass);
router.post('/marks-lock/bulk-by-session',                      marksLockController.bulkSetBySession);

// Analytics
router.get('/analytics/exam-stats/:examSubjectId', analyticsController.getExamStats);
router.get('/analytics/marks-report', analyticsController.getMarksReportList);
router.get('/analytics/marks-defaulters', analyticsController.getMarksDefaulters);
router.get('/analytics/attendance-defaulters', analyticsController.getAttendanceDefaultersList);
router.get('/analytics/attendance-report', analyticsController.getAttendanceReportList);
router.get('/analytics/report-card', analyticsController.getStudentReportCard);
router.get('/analytics/report-card-pdf', reportCardController.downloadReportCardPDF);
router.get('/analytics/bulk-report-cards-pdf', reportCardController.downloadBulkReportCardsZip);
router.get('/analytics/attendance-report-pdf', analyticsController.downloadAttendanceReportPDF);
router.get('/analytics/marks-report-pdf', analyticsController.downloadMarksReportPDF);
router.get('/analytics/marks-defaulters-pdf', analyticsController.downloadMarksDefaultersPDF);
router.get('/analytics/attendance-defaulters-pdf', analyticsController.downloadAttendanceDefaultersPDF);
router.get('/analytics/class-performance-pdf', analyticsController.downloadClassPerformancePDF);
router.get('/analytics/student-progress-pdf', analyticsController.downloadStudentProgressPDF);
router.get('/analytics/overview', analyticsController.getOverviewStats);
router.get('/analytics/class-comparison', analyticsController.getClassComparison);
router.get('/analytics/section-comparison', analyticsController.getSectionComparison);
router.get('/analytics/subject-comparison', analyticsController.getSubjectComparison);
router.get('/analytics/attendance-trend', analyticsController.getAttendanceTrendStats);
router.get('/analytics/performers', analyticsController.getPerformersList);
router.get('/analytics/student-progress', analyticsController.getStudentProgress);

// Holidays
router.post('/holidays', holidayController.createHoliday);
router.get('/holidays', holidayController.getHolidays);
router.delete('/holidays/:id', holidayController.deleteHoliday);

// Correction Requests (attendance + marks correction approvals)
router.get('/corrections', correctionController.getCorrectionRequests);
router.patch('/corrections/:id/review', correctionController.reviewCorrectionRequest);

// Fee collectors (receptionist logins)
router.get('/fee-staff', feeStaffController.listFeeStaff);
router.post('/fee-staff', feeStaffController.createFeeStaff);
router.patch('/fee-staff/:id', feeStaffController.updateFeeStaff);
router.post('/fee-staff/:id/password', feeStaffController.setFeeStaffPassword);
router.delete('/fee-staff/:id', feeStaffController.deleteFeeStaff);

router.get('/notifications', notificationController.listMyNotifications);
router.patch('/notifications/:id/read', notificationController.markNotificationRead);
router.patch('/notifications/read-all', notificationController.markAllNotificationsRead);



module.exports = router;