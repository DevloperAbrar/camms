const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { getAuditLogs } = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

const schoolController = require('../controllers/superadmin/school.controller');
const planController = require('../controllers/superadmin/plan.controller');
const subscriptionController = require('../controllers/superadmin/subscription.controller');
const dashboardController = require('../controllers/superadmin/dashboard.controller');

// Every route here is superadmin-only
router.use(authenticate, authorize('superadmin'));

// Dashboard
router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/school-usage', dashboardController.getSchoolUsage);

// Schools
router.post('/schools', schoolController.createSchool);
router.get('/schools', schoolController.getSchools);
router.get('/schools/:id', schoolController.getSchoolById);
router.patch('/schools/:id', schoolController.updateSchool);
router.post('/schools/:id/suspend', schoolController.suspendSchool);
router.post('/schools/:id/reactivate', schoolController.reactivateSchool);
router.patch('/schools/:id/plan', schoolController.changeSchoolPlan);
router.post('/schools/:id/reset-admin-password', schoolController.resetAdminPassword);
router.post('/schools/:id/impersonate', schoolController.impersonateSchoolAdmin);

// Plans
router.post('/plans', planController.createPlan);
router.get('/plans', planController.getPlans);
router.patch('/plans/:id', planController.updatePlan);
router.delete('/plans/:id', planController.deletePlan);

// Subscriptions
router.post('/subscriptions/:id/renew', subscriptionController.renewSubscription);
router.get('/subscriptions/:id/renewals', subscriptionController.getRenewalHistory);

// Platform-wide audit log
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const result = await getAuditLogs({ page: page ? Number(page) : 1, limit: limit ? Number(limit) : 50 });
    return ApiResponse.success(res, 200, 'Audit logs fetched', result);
  })
);

module.exports = router;