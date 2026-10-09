const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const notes = require('../../services/notes.service');
const { notesEntitlementSchema } = require('../../validators/notes.validator');

// GET /superadmin/notes/schools?search=
const listSchools = asyncHandler(async (req, res) => {
  const search = req.query.search ? String(req.query.search) : null;
  const schools = await prisma.school.findMany({
    where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { code: { contains: search, mode: 'insensitive' } }] } : {},
    orderBy: { name: 'asc' },
    take: 500,
    select: { id: true, name: true, code: true, status: true, notesSettings: true, _count: { select: { notes: true } } },
  });
  return ApiResponse.success(res, 200, 'Schools fetched', schools.map((s) => ({
    id: s.id, name: s.name, code: s.code, status: s.status,
    settings: notes.serializeSettings(s.notesSettings),
    noteCount: s._count.notes,
  })));
});

// PUT /superadmin/notes/schools/:id   body: { enabled, quotaMb, maxFileMb }
const updateSchoolNotes = asyncHandler(async (req, res) => {
  const d = notesEntitlementSchema.parse(req.body);
  const school = await prisma.school.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!school) throw httpError(404, 'School not found');

  const row = await prisma.schoolNotesSettings.upsert({
    where: { schoolId: school.id },
    create: { schoolId: school.id, enabled: d.enabled, quotaMb: d.quotaMb, maxFileMb: d.maxFileMb, disabledAt: d.enabled ? null : new Date() },
    update: { enabled: d.enabled, quotaMb: d.quotaMb, maxFileMb: d.maxFileMb, disabledAt: d.enabled ? null : new Date() },
  });

  req.body = { ...d, schoolId: school.id }; // logAudit reads the target school from the body for super admins
  await logAudit({ req, action: 'NOTES_SETTINGS_UPDATE', resourceType: 'school', resourceId: school.id, metadata: d });
  return ApiResponse.success(res, 200, 'Notes settings saved', notes.serializeSettings(row));
});

module.exports = { listSchools, updateSchoolNotes };