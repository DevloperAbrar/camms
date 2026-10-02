module.exports = {
  ROLES: {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    FACULTY: 'faculty',
    FEE_COLLECTOR: 'fee_collector',
  },
  SCHOOL_STATUS: {
    TRIAL: 'trial',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    SUSPENDED: 'suspended',
  },
  GRACE_PERIOD_DAYS: 7,
  COOKIE_NAME: 'amms_token',
  PAYMENT_MODES: ['cash', 'upi', 'card', 'cheque', 'bank_transfer', 'dd', 'other'],
};