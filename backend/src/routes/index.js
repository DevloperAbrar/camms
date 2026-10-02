const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const superadminRoutes = require('./superadmin.routes');
const schooladminRoutes = require('./schooladmin.routes');
const facultyRoutes = require('./faculty.routes');
const parentRoutes = require('./parent.routes');
const feesRoutes = require('./fees.routes');

router.use('/auth', authRoutes);
router.use('/superadmin', superadminRoutes);
router.use('/schooladmin', schooladminRoutes);
router.use('/faculty', facultyRoutes);
router.use('/parent', parentRoutes);
router.use('/fees', feesRoutes);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;