const { prisma } = require('../config/db');

// Call this inside controllers after a mutating action succeeds.
// Kept as a plain function (not auto-wired middleware) so each controller
// logs the exact resourceType/resourceId/metadata that matters for that action.
async function logAudit({ req, action, resourceType, resourceId = null, metadata = {} }) {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId: req.user.role === 'superadmin' ? (req.body.schoolId || null) : req.user.schoolId,
        actorId: req.user.id,
        actorRole: req.user.role,
        action,
        resourceType,
        resourceId,
        metadata,
        ipAddress: req.ip,
      },
    });
  } catch (err) {
    // Audit logging must never break the main request flow
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { logAudit };