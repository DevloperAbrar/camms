const { prisma } = require('../config/db');

async function getExamSubjectStats(examSubjectId) {
  const marks = await prisma.marks.findMany({
    where: { examSubjectId },
    select: { marksObtained: true },
  });

  if (marks.length === 0) {
    return { average: 0, highest: 0, lowest: 0, passPercentage: 0, totalEntries: 0 };
  }

  const examSubject = await prisma.examSubject.findUnique({ where: { id: examSubjectId } });
  const values = marks.map((m) => Number(m.marksObtained));

  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const passCount = values.filter((v) => v >= Number(examSubject.passingMarks)).length;
  const passPercentage = (passCount / values.length) * 100;

  return {
    average: Number(average.toFixed(2)),
    highest,
    lowest,
    passPercentage: Number(passPercentage.toFixed(2)),
    totalEntries: values.length,
  };
}

// Full marks report — ALL entries for the exam type (pass + fail), unlike
// getDefaulterList below which only returns students under the passing mark.
async function getMarksReport({ schoolId, examTypeId, subjectId, sectionId }) {
  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examTypeId,
      examType: { schoolId },
      ...(subjectId ? { subjectId } : {}),
    },
    include: { subject: { select: { name: true } } },
  });

  const rows = [];

  for (const es of examSubjects) {
    const marks = await prisma.marks.findMany({
      where: {
        examSubjectId: es.id,
        ...(sectionId ? { enrollment: { sectionId } } : {}),
      },
      include: {
        enrollment: {
          include: {
            student: { select: { id: true, name: true, enrollmentNumber: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: { enrollment: { rollNumber: 'asc' } },
    });

    marks.forEach((m) => {
      rows.push({
        studentId: m.enrollment.student.id,
        studentName: m.enrollment.student.name,
        enrollmentNumber: m.enrollment.student.enrollmentNumber,
        sectionName: m.enrollment.section?.name || '',
        subject: es.subject.name,
        marksObtained: Number(m.marksObtained),
        maxMarks: Number(es.maxMarks),
        passingMarks: Number(es.passingMarks),
      });
    });
  }

  return rows;
}

async function getDefaulterList({ schoolId, examTypeId, subjectId }) {
  const examSubjects = await prisma.examSubject.findMany({
    where: {
      examTypeId,
      examType: { schoolId },
      ...(subjectId ? { subjectId } : {}),
    },
    include: { subject: { select: { name: true } } },
  });

  const defaulters = [];

  for (const es of examSubjects) {
    const marks = await prisma.marks.findMany({
      where: { examSubjectId: es.id, marksObtained: { lt: es.passingMarks } },
      include: {
        enrollment: {
          include: { student: { select: { id: true, name: true, enrollmentNumber: true } } },
        },
      },
    });

    marks.forEach((m) => {
      defaulters.push({
        studentId: m.enrollment.student.id,
        studentName: m.enrollment.student.name,
        enrollmentNumber: m.enrollment.student.enrollmentNumber,
        subject: es.subject.name,
        marksObtained: m.marksObtained,
        passingMarks: es.passingMarks,
      });
    });
  }

  return defaulters;
}

async function getAttendanceDefaulters({ schoolId, sessionId, classId, sectionId, thresholdPercent = 75 }) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      student: { schoolId },
    },
    include: { student: { select: { id: true, name: true, enrollmentNumber: true } } },
  });

  const results = [];

  for (const enr of enrollments) {
    const total = await prisma.attendance.count({ where: { enrollmentId: enr.id } });
    const present = await prisma.attendance.count({ where: { enrollmentId: enr.id, status: { in: ['present', 'late'] } } });

    const percentage = total > 0 ? (present / total) * 100 : 100;

    if (percentage < thresholdPercent) {
      results.push({
        studentId: enr.student.id,
        studentName: enr.student.name,
        enrollmentNumber: enr.student.enrollmentNumber,
        attendancePercentage: Number(percentage.toFixed(2)),
        totalDays: total,
        presentDays: present,
      });
    }
  }

  return results;
}

// ============= OVERVIEW =============

async function getOverview({ schoolId, sessionId }) {
  const [totalStudents, totalClasses, totalSections, totalFaculty] = await Promise.all([
    prisma.enrollment.count({ where: { sessionId, status: 'active', student: { schoolId } } }),
    prisma.class.count({ where: { schoolId, sessionId } }),
    prisma.section.count({ where: { schoolId, class: { sessionId } } }),
    prisma.user.count({ where: { schoolId, role: 'faculty', status: 'active' } }),
  ]);

  const attendanceRecords = await prisma.attendance.findMany({
    where: { subjectId: null, enrollment: { sessionId, student: { schoolId } } },
    select: { status: true },
  });
  const totalAttendance = attendanceRecords.length;
  const presentAttendance = attendanceRecords.filter((a) => a.status === 'present' || a.status === 'late').length;
  const avgAttendancePercent = totalAttendance > 0
    ? Number(((presentAttendance / totalAttendance) * 100).toFixed(2))
    : 0;

  const marksRecords = await prisma.marks.findMany({
    where: { examSubject: { examType: { sessionId, schoolId } } },
    select: { marksObtained: true, examSubject: { select: { maxMarks: true, passingMarks: true } } },
  });
  const totalMarksEntries = marksRecords.length;
  const passCount = marksRecords.filter((m) => Number(m.marksObtained) >= Number(m.examSubject.passingMarks)).length;
  const avgExamPassPercent = totalMarksEntries > 0
    ? Number(((passCount / totalMarksEntries) * 100).toFixed(2))
    : 0;
  const avgScorePercent = totalMarksEntries > 0
    ? Number((marksRecords.reduce((sum, m) => sum + (Number(m.marksObtained) / Number(m.examSubject.maxMarks)) * 100, 0) / totalMarksEntries).toFixed(2))
    : 0;

  const genderRows = await prisma.student.groupBy({
    by: ['gender'],
    where: { schoolId, enrollments: { some: { sessionId } } },
    _count: { _all: true },
  });
  const genderDistribution = genderRows.map((g) => ({ gender: g.gender || 'Unspecified', count: g._count._all }));

  return {
    totalStudents,
    totalClasses,
    totalSections,
    totalFaculty,
    avgAttendancePercent,
    avgExamPassPercent,
    avgScorePercent,
    totalMarksEntries,
    genderDistribution,
  };
}

// ============= CLASS / SECTION / SUBJECT COMPARISON =============

async function getClassWisePerformance({ schoolId, sessionId }) {
  const classes = await prisma.class.findMany({
    where: { schoolId, sessionId },
    orderBy: { sortOrder: 'asc' },
  });

  const results = [];
  for (const cls of classes) {
    const marks = await prisma.marks.findMany({
      where: { examSubject: { examType: { classId: cls.id, sessionId, schoolId } } },
      select: { marksObtained: true, examSubject: { select: { maxMarks: true, passingMarks: true } } },
    });
    const attendance = await prisma.attendance.findMany({
      where: { subjectId: null, enrollment: { classId: cls.id, sessionId, student: { schoolId } } },
      select: { status: true },
    });

    results.push({
      classId: cls.id,
      className: cls.name,
      avgScorePercent: pctAvg(marks),
      passPercent: pctPass(marks),
      attendancePercent: pctAttendance(attendance),
      totalMarksEntries: marks.length,
    });
  }

  return results;
}

async function getSectionWisePerformance({ schoolId, sessionId, classId }) {
  const sections = await prisma.section.findMany({ where: { schoolId, classId }, orderBy: { name: 'asc' } });

  const results = [];
  for (const sec of sections) {
    const marks = await prisma.marks.findMany({
      where: {
        examSubject: { examType: { classId, sessionId, schoolId } },
        enrollment: { sectionId: sec.id },
      },
      select: { marksObtained: true, examSubject: { select: { maxMarks: true, passingMarks: true } } },
    });
    const attendance = await prisma.attendance.findMany({
      where: { subjectId: null, enrollment: { sectionId: sec.id, sessionId, student: { schoolId } } },
      select: { status: true },
    });

    results.push({
      sectionId: sec.id,
      sectionName: sec.name,
      avgScorePercent: pctAvg(marks),
      passPercent: pctPass(marks),
      attendancePercent: pctAttendance(attendance),
      totalMarksEntries: marks.length,
    });
  }

  return results;
}

async function getSubjectWisePerformance({ schoolId, examTypeId }) {
  const examSubjects = await prisma.examSubject.findMany({
    where: { examTypeId, examType: { schoolId } },
    include: { subject: { select: { name: true } } },
  });

  const results = [];
  for (const es of examSubjects) {
    const stats = await getExamSubjectStats(es.id);
    results.push({
      subjectId: es.subjectId,
      subject: es.subject.name,
      maxMarks: Number(es.maxMarks),
      passingMarks: Number(es.passingMarks),
      ...stats,
    });
  }

  return results;
}

// ============= ATTENDANCE TRENDS =============

async function getAttendanceTrend({ schoolId, sessionId, classId, sectionId }) {
  const records = await prisma.attendance.findMany({
    where: {
      subjectId: null,
      enrollment: {
        sessionId,
        ...(classId ? { classId } : {}),
        ...(sectionId ? { sectionId } : {}),
        student: { schoolId },
      },
    },
    select: { date: true, status: true },
    orderBy: { date: 'asc' },
  });

  const buckets = {};
  for (const r of records) {
    const key = r.date.toISOString().slice(0, 7); // YYYY-MM
    if (!buckets[key]) buckets[key] = { total: 0, present: 0 };
    buckets[key].total += 1;
    if (r.status === 'present' || r.status === 'late') buckets[key].present += 1;
  }

  return Object.keys(buckets)
    .sort()
    .map((month) => ({
      month,
      attendancePercent: Number(((buckets[month].present / buckets[month].total) * 100).toFixed(2)),
      totalRecords: buckets[month].total,
    }));
}

// ============= TOP / BOTTOM PERFORMERS =============

async function getTopBottomPerformers({ schoolId, examTypeId, sectionId, limit = 5 }) {
  const examSubjects = await prisma.examSubject.findMany({
    where: { examTypeId, examType: { schoolId } },
  });
  const examSubjectIds = examSubjects.map((es) => es.id);
  const maxMarksMap = Object.fromEntries(examSubjects.map((es) => [es.id, Number(es.maxMarks)]));

  if (examSubjectIds.length === 0) return { top: [], bottom: [] };

  const marks = await prisma.marks.findMany({
    where: {
      examSubjectId: { in: examSubjectIds },
      ...(sectionId ? { enrollment: { sectionId } } : {}),
    },
    include: {
      enrollment: { include: { student: { select: { id: true, name: true, enrollmentNumber: true } } } },
    },
  });

  const byStudent = {};
  for (const m of marks) {
    const sid = m.enrollment.student.id;
    if (!byStudent[sid]) {
      byStudent[sid] = {
        studentId: sid,
        studentName: m.enrollment.student.name,
        enrollmentNumber: m.enrollment.student.enrollmentNumber,
        totalPercent: 0,
        count: 0,
      };
    }
    byStudent[sid].totalPercent += (Number(m.marksObtained) / maxMarksMap[m.examSubjectId]) * 100;
    byStudent[sid].count += 1;
  }

  const ranked = Object.values(byStudent)
    .map((v) => ({
      studentId: v.studentId,
      studentName: v.studentName,
      enrollmentNumber: v.enrollmentNumber,
      averagePercent: Number((v.totalPercent / v.count).toFixed(2)),
    }))
    .sort((a, b) => b.averagePercent - a.averagePercent);

  return {
    top: ranked.slice(0, limit),
    bottom: ranked.slice(-limit).reverse(),
  };
}

// ============= INDIVIDUAL STUDENT PROGRESS =============

async function getStudentProgressTrend({ schoolId, studentId, sessionId }) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, sessionId, student: { schoolId } },
  });
  if (!enrollment) return { examTrend: [], subjectBreakdown: [], attendanceTrend: [] };

  const examTypes = await prisma.examType.findMany({
    where: { sessionId, classId: enrollment.classId },
    include: {
      examSubjects: {
        include: {
          subject: { select: { name: true } },
          marks: { where: { enrollmentId: enrollment.id } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const examTrend = examTypes.map((et) => {
    const entered = et.examSubjects.filter((es) => es.marks.length > 0);
    const averagePercent = entered.length
      ? Number((entered.reduce((s, es) => s + (Number(es.marks[0].marksObtained) / Number(es.maxMarks)) * 100, 0) / entered.length).toFixed(2))
      : null;
    return { examType: et.name, averagePercent };
  });

  const latestGraded = [...examTypes].reverse().find((et) => et.examSubjects.some((es) => es.marks.length > 0));
  const subjectBreakdown = latestGraded
    ? latestGraded.examSubjects
        .filter((es) => es.marks.length > 0)
        .map((es) => ({
          subject: es.subject.name,
          percent: Number(((Number(es.marks[0].marksObtained) / Number(es.maxMarks)) * 100).toFixed(2)),
        }))
    : [];

  const attendance = await prisma.attendance.findMany({
    where: { enrollmentId: enrollment.id, subjectId: null },
    select: { date: true, status: true },
    orderBy: { date: 'asc' },
  });
  const buckets = {};
  for (const r of attendance) {
    const key = r.date.toISOString().slice(0, 7);
    if (!buckets[key]) buckets[key] = { total: 0, present: 0 };
    buckets[key].total += 1;
    if (r.status === 'present' || r.status === 'late') buckets[key].present += 1;
  }
  const attendanceTrend = Object.keys(buckets)
    .sort()
    .map((month) => ({
      month,
      attendancePercent: Number(((buckets[month].present / buckets[month].total) * 100).toFixed(2)),
    }));

  return { examTrend, subjectBreakdown, attendanceTrend, latestExamType: latestGraded?.name || null };
}

// ============= SMALL HELPERS =============

function pctAvg(marks) {
  if (!marks.length) return 0;
  const sum = marks.reduce((s, m) => s + (Number(m.marksObtained) / Number(m.examSubject.maxMarks)) * 100, 0);
  return Number((sum / marks.length).toFixed(2));
}

function pctPass(marks) {
  if (!marks.length) return 0;
  const passCount = marks.filter((m) => Number(m.marksObtained) >= Number(m.examSubject.passingMarks)).length;
  return Number(((passCount / marks.length) * 100).toFixed(2));
}

function pctAttendance(records) {
  if (!records.length) return 0;
  const present = records.filter((a) => a.status === 'present' || a.status === 'late').length;
  return Number(((present / records.length) * 100).toFixed(2));
}

// ============= ATTENDANCE REPORT (date-range aware, returns ALL students) =============

async function getAttendanceReport({ schoolId, sessionId, classId, sectionId, fromDate, toDate }) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      sessionId,
      status: 'active',
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      student: { schoolId },
    },
    include: {
      student: { select: { id: true, name: true, enrollmentNumber: true } },
      class:   { select: { name: true } },
      section: { select: { name: true } },
    },
    orderBy: [{ class: { sortOrder: 'asc' } }, { rollNumber: 'asc' }],
  });

  // Build date filter
  const dateFilter = {};
  if (fromDate) dateFilter.gte = new Date(fromDate);
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    dateFilter.lte = to;
  }

  const results = [];

  for (const enr of enrollments) {
    const where = {
      enrollmentId: enr.id,
      subjectId: null, // daily attendance only
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    };

    const [total, present, absent, late] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.count({ where: { ...where, status: 'present' } }),
      prisma.attendance.count({ where: { ...where, status: 'absent' } }),
      prisma.attendance.count({ where: { ...where, status: 'late' } }),
    ]);

    const attendancePercentage = total > 0
      ? Number(((( present + late) / total) * 100).toFixed(2))
      : null; // null means no attendance marked

    results.push({
      studentId:            enr.student.id,
      studentName:          enr.student.name,
      enrollmentNumber:     enr.student.enrollmentNumber,
      className:            enr.class?.name  || '',
      sectionName:          enr.section?.name || '',
      rollNumber:           enr.rollNumber || '',
      presentDays:          present,
      absentDays:           absent,
      lateDays:             late,
      totalDays:            total,
      attendancePercentage: attendancePercentage,
    });
  }

  return results;
}

module.exports = {
  getExamSubjectStats,
  getDefaulterList,
  getAttendanceDefaulters,
  getAttendanceReport,
  getOverview,
  getClassWisePerformance,
  getSectionWisePerformance,
  getSubjectWisePerformance,
  getAttendanceTrend,
  getTopBottomPerformers,
  getStudentProgressTrend,
  getMarksReport
};