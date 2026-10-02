const express = require('express');
const multer = require('multer');
const router = express.Router();

const { authenticate } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { enforceTenant } = require('../middleware/tenant.middleware');
const { checkSubscriptionActive } = require('../middleware/subscription.middleware');
const { requireFeeModule, feeContext } = require('../middleware/fee.middleware');

const settingsC = require('../controllers/fees/settings.controller');
const setupC = require('../controllers/fees/setup.controller');
const collectC = require('../controllers/fees/collection.controller');
const reportsC = require('../controllers/fees/reports.controller');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpeg)$/.test(file.mimetype)) {
      const e = new Error('Logo must be a PNG or JPG image');
      e.statusCode = 422;
      return cb(e);
    }
    cb(null, true);
  },
});
const logoMiddleware = (req, res, next) =>
  logoUpload.single('logo')(req, res, (err) => {
    if (!err) return next();
    err.statusCode = 422;
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Logo must be under 1 MB';
    return next(err);
  });

const adminOnly = authorize('admin');

// Both roles (school admin + fee collector), tenant scoped, subscription active, module enabled
router.use(authenticate, authorize('admin', 'fee_collector'), enforceTenant, checkSubscriptionActive, requireFeeModule, feeContext);

router.get('/meta', settingsC.getMeta);

// Dashboard / students / ledger
router.get('/analytics/dashboard', reportsC.getDashboard);
router.get('/students', collectC.listStudents);
router.get('/students/:studentId/ledger', collectC.getLedger);
router.get('/students/:studentId/statement-pdf', collectC.statementPdf);

// Collect
router.post('/collect', collectC.collectFees);
router.post('/concessions', collectC.applyConcession);
router.post('/dues/generate', setupC.generateDues);

// Receipts (fixed paths before :id)
router.get('/receipts', collectC.listReceipts);
router.get('/receipts/export', reportsC.exportReceiptsCsv);
router.get('/receipts/collection-pdf', reportsC.collectionPdf);
router.get('/receipts/:id', collectC.getReceipt);
router.get('/receipts/:id/pdf', collectC.receiptPdf);
router.post('/receipts/:id/cancel', adminOnly, collectC.cancelReceipt);

// Dues
router.get('/dues/export', reportsC.exportDuesCsv);
router.get('/dues/pdf', reportsC.duesPdf);
router.post('/dues/remind', reportsC.sendReminders);

// Ledger edits (admin)
router.post('/charges', adminOnly, collectC.addCharge);
router.delete('/charges/:id', adminOnly, collectC.deleteCharge);

// Settings (admin)
router.get('/settings', adminOnly, settingsC.getSettings);
router.put('/settings', adminOnly, settingsC.updateSettings);
router.post('/settings/logo', adminOnly, logoMiddleware, settingsC.uploadLogo);
router.delete('/settings/logo', adminOnly, settingsC.removeLogo);

// Fee heads + class structure (admin)
router.get('/heads', adminOnly, setupC.getHeads);
router.post('/heads', adminOnly, setupC.createHead);
router.patch('/heads/:id', adminOnly, setupC.updateHead);
router.delete('/heads/:id', adminOnly, setupC.deleteHead);

router.get('/structure', adminOnly, setupC.getStructure);
router.post('/structure', adminOnly, setupC.createStructureItem);
router.post('/structure/copy', adminOnly, setupC.copyStructure);
router.patch('/structure/:id', adminOnly, setupC.updateStructureItem);
router.delete('/structure/:id', adminOnly, setupC.deleteStructureItem);

module.exports = router;