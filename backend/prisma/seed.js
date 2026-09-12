const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Subscription Plans
  const basicPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-basic' },
    update: {},
    create: {
      id: 'plan-basic',
      name: 'Basic',
      maxStudents: 300,
      maxFaculty: 20,
      maxClasses: 10,
      features: { smsAlerts: false, pdfReportCards: true, advancedAnalytics: false },
      price: 4999,
      billingCycle: 'yearly',
    },
  });

  const standardPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-standard' },
    update: {},
    create: {
      id: 'plan-standard',
      name: 'Standard',
      maxStudents: 800,
      maxFaculty: 50,
      maxClasses: 25,
      features: { smsAlerts: true, pdfReportCards: true, advancedAnalytics: false },
      price: 9999,
      billingCycle: 'yearly',
    },
  });

  const premiumPlan = await prisma.subscriptionPlan.upsert({
    where: { id: 'plan-premium' },
    update: {},
    create: {
      id: 'plan-premium',
      name: 'Premium',
      maxStudents: 2000,
      maxFaculty: 150,
      maxClasses: 60,
      features: { smsAlerts: true, pdfReportCards: true, advancedAnalytics: true },
      price: 19999,
      billingCycle: 'yearly',
    },
  });

  console.log('Plans seeded:', basicPlan.name, standardPlan.name, premiumPlan.name);

  // 2. Super Admin
  const superadminEmail = process.env.SUPERADMIN_EMAIL || 'admin@campussafar.com';
  const superadminPassword = process.env.SUPERADMIN_SEED_PASSWORD || 'ChangeMe@123';
  const hash = await bcrypt.hash(superadminPassword, 12);

  const superadmin = await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {},
    create: {
      email: superadminEmail,
      name: 'Super Admin',
      role: 'superadmin',
      passwordHash: hash,
      schoolId: null,
      status: 'active',
    },
  });

  console.log('Super admin seeded:', superadmin.email);

  // 3. Demo School
  const demoSchool = await prisma.school.upsert({
    where: { code: 'DEMO001' },
    update: {},
    create: {
      name: 'CampusSafar Demo School',
      code: 'DEMO001',
      address: 'Jabalpur, Madhya Pradesh',
      contactEmail: 'demo@campussafar.com',
      contactPhone: '9999999999',
      timezone: 'Asia/Kolkata',
      status: 'active',
    },
  });

  await prisma.schoolSubscription.upsert({
    where: { id: 'sub-demo' },
    update: {},
    create: {
      id: 'sub-demo',
      schoolId: demoSchool.id,
      planId: premiumPlan.id,
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      status: 'active',
      createdBy: superadmin.id,
    },
  });

  console.log('Demo school seeded:', demoSchool.name);

  // 4. School Admin
  const adminHash = await bcrypt.hash('School@123', 12);
  const schoolAdmin = await prisma.user.upsert({
    where: { email: 'schooladmin@demo.com' },
    update: {},
    create: {
      email: 'schooladmin@demo.com',
      name: 'Demo School Admin',
      role: 'admin',
      passwordHash: adminHash,
      schoolId: demoSchool.id,
      status: 'active',
    },
  });

  console.log('School admin seeded:', schoolAdmin.email);

  // 5. Academic Session
  const session = await prisma.academicSession.upsert({
    where: { id: 'session-demo-2526' },
    update: {},
    create: {
      id: 'session-demo-2526',
      schoolId: demoSchool.id,
      label: '2025-2026',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      isActive: true,
    },
  });

  console.log('Session seeded:', session.label);

  // 6. Class + Section
  const class7 = await prisma.class.upsert({
    where: { id: 'class-demo-7' },
    update: {},
    create: {
      id: 'class-demo-7',
      schoolId: demoSchool.id,
      sessionId: session.id,
      name: 'Class 7',
      sortOrder: 7,
    },
  });

  const section7A = await prisma.section.upsert({
    where: { id: 'section-demo-7a' },
    update: {},
    create: {
      id: 'section-demo-7a',
      schoolId: demoSchool.id,
      classId: class7.id,
      name: '7-A',
    },
  });

  console.log('Class and section seeded');

  // 7. Subjects
  const subjectNames = ['Mathematics', 'Science', 'English', 'Hindi', 'Social Science'];
  for (let i = 0; i < subjectNames.length; i++) {
    await prisma.subject.upsert({
      where: { id: `sub-demo-${i}` },
      update: {},
      create: {
        id: `sub-demo-${i}`,
        schoolId: demoSchool.id,
        sessionId: session.id,
        classId: class7.id,
        name: subjectNames[i],
        code: subjectNames[i].slice(0, 3).toUpperCase(),
      },
    });
  }

  console.log('Subjects seeded');

  // 8. Demo Faculty
  const facultyHash = await bcrypt.hash('Faculty@123', 12);
  const faculty = await prisma.user.upsert({
    where: { email: 'faculty@demo.com' },
    update: {},
    create: {
      email: 'faculty@demo.com',
      name: 'Demo Faculty',
      role: 'faculty',
      passwordHash: facultyHash,
      schoolId: demoSchool.id,
      status: 'active',
    },
  });

  console.log('Faculty seeded:', faculty.email);

  // 9. Demo Student + Enrollment
  const student = await prisma.student.upsert({
    where: { id: 'student-demo-001' },
    update: {},
    create: {
      id: 'student-demo-001',
      schoolId: demoSchool.id,
      name: 'Riya Sharma',
      enrollmentNumber: 'ENR2025001',
      gender: 'female',
      parentName: 'Anil Sharma',
      parentEmail: 'parent@demo.com',
      parentPhone: '9876543210',
      status: 'active',
    },
  });

  await prisma.enrollment.upsert({
    where: { studentId_sessionId: { studentId: student.id, sessionId: session.id } },
    update: {},
    create: {
      studentId: student.id,
      sessionId: session.id,
      classId: class7.id,
      sectionId: section7A.id,
      rollNumber: '01',
      status: 'active',
    },
  });

  console.log('Student seeded:', student.name);
  console.log('\n✅ Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Super Admin :', superadminEmail, '/', superadminPassword);
  console.log('School Admin: schooladmin@demo.com / School@123');
  console.log('Faculty     : faculty@demo.com / Faculty@123');
  console.log('Parent email: parent@demo.com');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });