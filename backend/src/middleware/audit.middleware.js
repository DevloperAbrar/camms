const { prisma } = require('../config/db');

// Call this inside controllers after a mutating action succeeds.
// Kept as a plain function (not auto-wired middleware) so each controller
// logs the exact resourceType/resourceId/metadata that matters for that action.
async function logAudit({ req, action, resourceType, resourceId = null, metadata = {} }) {
  try {
    const body = req.body || {}; // Express 5: req.body is undefined when no body was sent

    await prisma.auditLog.create({
      data: {
        schoolId: req.user.role === 'superadmin' ? (body.schoolId || null) : req.user.schoolId,
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