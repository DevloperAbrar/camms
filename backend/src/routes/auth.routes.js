const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const superadminAuth = require('../controllers/auth/superadmin.auth.controller');
const adminAuth = require('../controllers/auth/admin.auth.controller');
const facultyAuth = require('../controllers/auth/faculty.auth.controller');
const parentAuth = require('../controllers/auth/parent.auth.controller');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

// Super Admin
router.post('/superadmin/login', loginLimiter, superadminAuth.login);
router.post('/superadmin/logout', superadminAuth.logout);

// Admin
router.get('/admin/google', adminAuth.googleLogin);
router.get('/admin/google/callback', adminAuth.googleCallback);
router.post('/admin/password-login', loginLimiter, adminAuth.passwordLogin);
router.post('/admin/logout', adminAuth.logout);

// Faculty
router.get('/faculty/google', facultyAuth.googleLogin);
router.get('/faculty/google/callback', facultyAuth.googleCallback);
router.post('/faculty/password-login', loginLimiter, facultyAuth.passwordLogin);
router.post('/faculty/logout', facultyAuth.logout);

// Parent (Google only)
router.get('/parent/google', parentAuth.googleLogin);
router.get('/parent/google/callback', parentAuth.googleCallback);
router.post('/parent/logout', parentAuth.logout);

module.exports = router;