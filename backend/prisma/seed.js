const bcrypt = require('bcrypt');
const { PrismaClient, UserRole } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin@123456', 10);
  const teacherPassword = await bcrypt.hash('Teacher@123456', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      displayName: '系统管理员',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
    },
    create: {
      username: 'admin',
      displayName: '系统管理员',
      passwordHash: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { username: 'teacher' },
    update: {
      displayName: '演示教师',
      passwordHash: teacherPassword,
      role: UserRole.TEACHER,
    },
    create: {
      username: 'teacher',
      displayName: '演示教师',
      passwordHash: teacherPassword,
      role: UserRole.TEACHER,
    },
  });

  const demoClass = await prisma.class.upsert({
    where: { id: 'demo-class-1' },
    update: {
      name: '七年级一班',
      grade: '七年级',
      academicYear: '2025-2026',
      teacherId: teacher.id,
    },
    create: {
      id: 'demo-class-1',
      name: '七年级一班',
      grade: '七年级',
      academicYear: '2025-2026',
      teacherId: teacher.id,
    },
  });

  const students = [
    { name: '张三', studentNo: '2026001', gender: '男' },
    { name: '李四', studentNo: '2026002', gender: '女' },
    { name: '王五', studentNo: '2026003', gender: '男' },
  ];

  for (const student of students) {
    await prisma.student.upsert({
      where: {
        id: `${demoClass.id}-${student.studentNo}`,
      },
      update: {
        ...student,
        classId: demoClass.id,
      },
      create: {
        id: `${demoClass.id}-${student.studentNo}`,
        ...student,
        classId: demoClass.id,
      },
    });
  }

  console.log('Seed completed', {
    admin: admin.username,
    teacher: teacher.username,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
