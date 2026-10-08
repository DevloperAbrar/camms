const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const httpError = require('../../utils/httpError');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const V = require('../../validators/reception.validator');
const S = require('../../services/reception.service');
const { FIELD_SCOPES, MAX_FIELDS_PER_SCOPE } = require('../../config/reception.constants');

// Both roles can read active fields (they render the forms). Only admins see inactive ones (?all=1).
const listFields = asyncHandler(async (req, res) => {
  const scope = FIELD_SCOPES.includes(req.query.scope) ? req.query.scope : undefined;
  const includeInactive = req.user.role === 'admin' && req.query.all === '1';
  const where = { schoolId: req.schoolId, ...(scope ? { scope } : {}), ...(includeInactive ? {} : { isActive: true }) };
  const fields = await prisma.receptionField.findMany({ where, orderBy: [{ scope: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return ApiResponse.success(res, 200, 'Fields fetched', fields);
});

const createField = asyncHandler(async (req, res) => {
  const data = V.createFieldSchema.parse(req.body);
  const { schoolId } = req;

  const existing = await prisma.receptionField.findMany({
    where: { schoolId, scope: data.scope }, select: { key: true, sortOrder: true, isActive: true },
  });
  if (existing.filter((f) => f.isActive).length >= MAX_FIELDS_PER_SCOPE) {
    throw httpError(422, `You can have at most ${MAX_FIELDS_PER_SCOPE} custom fields per form`);
  }

  const taken = new Set(existing.map((f) => f.key));
  const base = S.slugKey(data.label);
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;

  const field = await prisma.receptionField.create({
    data: {
      schoolId, scope: data.scope, key, label: data.label, type: data.type,
      options: data.type === 'select' ? data.options : [],
      isRequired: !!data.isRequired,
      sortOrder: existing.reduce((m, f) => Math.max(m, f.sortOrder), 0) + 1,
    },
  });
  await logAudit({ req, action: 'CREATE_RECEPTION_FIELD', resourceType: 'reception_field', resourceId: field.id, metadata: { scope: data.scope, label: data.label } });
  return ApiResponse.success(res, 201, 'Field added', field);
});

const updateField = asyncHandler(async (req, res) => {
  const data = V.updateFieldSchema.parse(req.body);
  const field = await prisma.receptionField.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!field) return ApiResponse.error(res, 404, 'Field not found');

  const patch = {};
  if (data.label !== undefined) patch.label = data.label;
  if (data.isRequired !== undefined) patch.isRequired = data.isRequired;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  if (data.options !== undefined) {
    if (field.type !== 'select') throw httpError(422, 'Only dropdown fields have options');
    if (data.options.length < 2 || new Set(data.options).size !== data.options.length) {
      throw httpError(422, 'A dropdown needs at least 2 different options');
    }
    patch.options = data.options;
  }

  const updated = await prisma.receptionField.update({ where: { id: field.id }, data: patch });
  await logAudit({ req, action: 'UPDATE_RECEPTION_FIELD', resourceType: 'reception_field', resourceId: field.id, metadata: patch });
  return ApiResponse.success(res, 200, 'Field updated', updated);
});

const reorderFields = asyncHandler(async (req, res) => {
  const { scope, ids } = V.reorderFieldsSchema.parse(req.body);
  const found = await prisma.receptionField.findMany({
    where: { id: { in: ids }, schoolId: req.schoolId, scope }, select: { id: true },
  });
  if (found.length !== new Set(ids).size) throw httpError(422, 'Some fields were not found');

  await prisma.$transaction(
    ids.map((id, i) => prisma.receptionField.update({ where: { id }, data: { sortOrder: i + 1 } }))
  );
  return ApiResponse.success(res, 200, 'Order saved');
});

// Removes the field definition. Values already stored on past records are kept (just no longer shown).
const deleteField = asyncHandler(async (req, res) => {
  const field = await prisma.receptionField.findFirst({ where: { id: req.params.id, schoolId: req.schoolId } });
  if (!field) return ApiResponse.error(res, 404, 'Field not found');
  await prisma.receptionField.delete({ where: { id: field.id } });
  await logAudit({ req, action: 'DELETE_RECEPTION_FIELD', resourceType: 'reception_field', resourceId: field.id, metadata: { scope: field.scope, label: field.label } });
  return ApiResponse.success(res, 200, 'Field deleted');
});

module.exports = { listFields, createField, updateField, reorderFields, deleteField };