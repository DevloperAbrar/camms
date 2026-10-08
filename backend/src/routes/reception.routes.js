const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { enforceTenant } = require('../middleware/tenant.middleware');
const { checkSubscriptionActive } = require('../middleware/subscription.middleware');
const { requireReceptionModule, receptionContext } = require('../middleware/reception.middleware');

const receptionC = require('../controllers/reception/reception.controller');
const enquiryC = require('../controllers/reception/enquiry.controller');
const visitorC = require('../controllers/reception/visitor.controller');
const fieldC = require('../controllers/reception/field.controller');

const adminOnly = authorize('admin');

// School admin + receptionist, tenant scoped, subscription active, module enabled
router.use(authenticate, authorize('admin', 'receptionist'), enforceTenant, checkSubscriptionActive, requireReceptionModule, receptionContext);

router.get('/meta', receptionC.getMeta);
router.get('/dashboard', receptionC.getDashboard);

// Enquiries (fixed paths before :id)
router.get('/enquiries', enquiryC.listEnquiries);
router.get('/enquiries/export', enquiryC.exportCsv);
router.get('/enquiries/followups', enquiryC.getFollowUps);
router.get('/enquiries/convert-options', adminOnly, enquiryC.getConvertOptions);
router.post('/enquiries', enquiryC.createEnquiry);
router.get('/enquiries/:id', enquiryC.getEnquiry);
router.patch('/enquiries/:id', enquiryC.updateEnquiry);
router.post('/enquiries/:id/stage', enquiryC.changeStage);
router.post('/enquiries/:id/followups', enquiryC.addFollowUp);
router.post('/enquiries/:id/convert', adminOnly, enquiryC.convertEnquiry);
router.delete('/enquiries/:id', adminOnly, enquiryC.deleteEnquiry);

// Visitors
router.get('/visitors', visitorC.listVisitors);
router.get('/visitors/export', visitorC.exportCsv);
router.post('/visitors', visitorC.createVisitor);
router.post('/visitors/checkout-all', adminOnly, visitorC.checkoutAll);
router.post('/visitors/:id/checkout', visitorC.checkoutVisitor);
router.delete('/visitors/:id', adminOnly, visitorC.deleteVisitor);

// Custom form fields
router.get('/fields', fieldC.listFields);
router.post('/fields', adminOnly, fieldC.createField);
router.post('/fields/reorder', adminOnly, fieldC.reorderFields);
router.patch('/fields/:id', adminOnly, fieldC.updateField);
router.delete('/fields/:id', adminOnly, fieldC.deleteField);

module.exports = router;