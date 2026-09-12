const { parse } = require('csv-parse/sync');
const { prisma } = require('../config/db');

const REQUIRED_COLUMNS = [
  'name',
  'enrollmentNumber',
  'dob',
  'gender',
  'parentName',
  'parentEmail',
  'parentPhone',
  'className',
  'sectionName',
  'rollNumber',
];

function generateStudentCsvTemplate() {
  const header = REQUIRED_COLUMNS.join(',');
  const example = 'Aditya Sharma,ENR2026001,2014-05-12,Male,Ramesh Sharma,ramesh@example.com,9876543210,Class 7,7-A,12';
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

    for (const col of REQUIRED_COLUMNS) {
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

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, data: row, errors: rowErrors });
    } else {
      validRows.push({
        name: row.name,
        enrollmentNumber: row.enrollmentNumber,
        dob: row.dob ? new Date(row.dob) : null,
        gender: row.gender,
        parentName: row.parentName,
        parentEmail: row.parentEmail,
        parentPhone: row.parentPhone,
        classId: resolvedSection.classId,
        sectionId: resolvedSection.sectionId,
        rollNumber: row.rollNumber,
        sessionId,
      });
    }
  });

  return { validRows, errors, totalRows: records.length };
}

module.exports = { generateStudentCsvTemplate, validateStudentCsv, REQUIRED_COLUMNS };