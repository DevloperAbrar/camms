const ApiResponse = require('../utils/apiResponse');
const notes = require('../services/notes.service');

// Faculty + school admin: Notes must be switched on for this school by the super admin.
async function requireNotesFeature(req, res, next) {
  try {
    const settings = await notes.getSettings(req.schoolId);
    if (!settings.enabled) {
      return ApiResponse.error(res, 403, 'Notes is not enabled for your school. Please contact support.');
    }
    req.notesSettings = settings;
    next();
  } catch (err) {
    next(err);
  }
}

// Parent: run after verifyChildAccess (needs req.student).
async function requireNotesForChild(req, res, next) {
  try {
    const settings = await notes.childNotesSettings(req.student.schoolId);
    if (!settings.enabled) return ApiResponse.error(res, 403, 'Notes is not available for this school.');
    req.notesSettings = settings;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireNotesFeature, requireNotesForChild };