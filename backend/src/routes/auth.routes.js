const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');

const superadminAuth = require('../controllers/auth/superadmin.auth.controller');
const schoolAuth = require('../controllers/auth/school.auth.controller');
const facultyAuth = require('../controllers/auth/faculty.auth.controller');
const parentAuth = require('../controllers/auth/parent.auth.controller');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.get('/me', authenticate, (req, res) => {
  const { id, role, schoolId, name, email, parentEmail, children } = req.user;
  res.json({ success: true, data: { id, role, schoolId, name, email, parentEmail, children } });
});

router.post('/superadmin/login', loginLimiter, superadminAuth.login);
router.post('/superadmin/logout', superadminAuth.logout);

router.get('/school/google', schoolAuth.googleLogin);
router.get('/school/google/callback', schoolAuth.googleCallback);
router.post('/school/password-login', loginLimiter, schoolAuth.passwordLogin);
router.post('/school/logout', schoolAuth.logout);

router.post('/admin/logout', schoolAuth.logout);
router.post('/faculty/logout', facultyAuth.logout);
router.post('/parent/logout', parentAuth.logout);

module.exports = router;