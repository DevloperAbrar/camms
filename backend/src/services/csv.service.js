const { parse } = require('csv-parse/sync');
const { prisma } = require('../config/db');

// All columns the template exposes — this must always mirror the manual "Add Student" form fields.
const TEMPLATE_COLUMNS = [
  'name',
  'enrollmentNumber',
  'dob',
  'gender',
  'parentName',
  'parentEmail',
  'parentPhone',
  'secondaryParentPhone',
  'address',
  'admissionDate',
  'className',
  'sectionName',
  'rollNumber',
];

// Only these truly must have a value — everything else in TEMPLATE_COLUMNS is optional,
// same as the manual Add Student form (name + enrollment + class/section placement are the only hard requirements).
const MANDATORY_COLUMNS = ['name', 'enrollmentNumber', 'className', 'sectionName'];

function generateStudentCsvTemplate() {
  const header = TEMPLATE_COLUMNS.join(',');
  const example = [
    'Aditya Sharma',
    'ENR2026001',
    '2014-05-12',
    'Male',
    'Ramesh Sharma',
    'ramesh@example.com',
    '9876543210',
    '9123456789',
    'Indore, MP',
    '2026-04-01',
    'Class 7',
    'A',
    '12',
  ].join(',');
  return `${header}\n${example}`;
}

// Parses the CSV and validates every row WITHOUT saving anything.
// Returns { validRows, errors } so the admin sees problems before committing.
async function validateStudentCsv(buffer, { schoolId, sessionId, classesMap }) {
  const records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });

  const errors = [];
  const validRows = [];
  const seenEnrollmentNumbers = new Set();

  const existingNumbers = new Set(
    (await prisma.student.findMany({ where: { schoolId }, select: { enrollmentNumber: true } })).map(
      (s) => s.enrollmentNumber
    )
  );

  records.forEach((row, index) => {
    const rowNum = index + 2; // +2 accounts for header row + 0-index
    const rowErrors = [];

    for (const col of MANDATORY_COLUMNS) {
      if (!row[col] || row[col].trim() === '') {
        rowErrors.push(`Missing value for "${col}"`);
      }
    }

    if (row.enrollmentNumber) {
      if (existingNumbers.has(row.enrollmentNumber) || seenEnrollmentNumbers.has(row.enrollmentNumber)) {
        rowErrors.push(`Duplicate enrollment number "${row.enrollmentNumber}"`);
      }
      seenEnrollmentNumbers.add(row.enrollmentNumber);
    }

    const classKey = `${row.className}::${row.sectionName}`;
    const resolvedSection = classesMap[classKey];

    if (!resolvedSection) {
      rowErrors.push(`Class/Section "${row.className} / ${row.sectionName}" does not exist for this session`);
    }

    if (row.parentEmail && !/^\S+@\S+\.\S+$/.test(row.parentEmail)) {
      rowErrors.push(`Invalid parent email format`);
    }

    if (row.dob && isNaN(Date.parse(row.dob))) {
      rowErrors.push(`Invalid date format for "dob" — use YYYY-MM-DD`);
    }

    if (row.admissionDate && isNaN(Date.parse(row.admissionDate))) {
      rowErrors.push(`Invalid date format for "admissionDate" — use YYYY-MM-DD`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, data: row, errors: rowErrors });
    } else {
      validRows.push({
        name: row.name,
        enrollmentNumber: row.enrollmentNumber,
        dob: row.dob ? new Date(row.dob) : null,
        gender: row.gender || null,
        parentName: row.parentName || null,
        parentEmail: row.parentEmail || null,
        parentPhone: row.parentPhone || null,
        secondaryParentPhone: row.secondaryParentPhone || null,
        address: row.address || null,
        admissionDate: row.admissionDate ? new Date(row.admissionDate) : null,
        classId: resolvedSection.classId,
        sectionId: resolvedSection.sectionId,
        rollNumber: row.rollNumber || null,
        sessionId,
      });
    }
  });

  return { validRows, errors, totalRows: records.length };
}

module.exports = { generateStudentCsvTemplate, validateStudentCsv, TEMPLATE_COLUMNS, MANDATORY_COLUMNS };