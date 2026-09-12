const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { prisma } = require('../../config/db');
const { logAudit } = require('../../middleware/audit.middleware');
const { createHolidaySchema } = require('../../validators/exam.validator');

const createHoliday = asyncHandler(async (req, res) => {
  const data = createHolidaySchema.parse(req.body);

  const holiday = await prisma.holiday.create({
    data: { schoolId: req.schoolId, sessionId: data.sessionId, date: new Date(data.date), description: data.description },
  });

  await logAudit({ req, action: 'CREATE_HOLIDAY', resourceType: 'holiday', resourceId: holiday.id });

  return ApiResponse.success(res, 201, 'Holiday added', holiday);
});

const getHolidays = asyncHandler(async (req, res) => {
  const { sessionId } = req.query;
  const holidays = await prisma.holiday.findMany({
    where: { schoolId: req.schoolId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { date: 'asc' },
  });
  return ApiResponse.success(res, 200, 'Holidays fetched', holidays);
});

const deleteHoliday = asyncHandler(async (req, res) => {
  await prisma.holiday.delete({ where: { id: req.params.id } });
  await logAudit({ req, action: 'DELETE_HOLIDAY', resourceType: 'holiday', resourceId: req.params.id });
  return ApiResponse.success(res, 200, 'Holiday deleted');
});

module.exports = { createHoliday, getHolidays, deleteHoliday };