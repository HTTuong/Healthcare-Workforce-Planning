import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Creates the first admin, or resets an existing one. Run with: npm run create-admin
const email = process.env['ADMIN_EMAIL']?.trim().toLowerCase();
const password = process.env['ADMIN_PASSWORD'];
if (!email || !password || password.length < 12) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters)');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
try {
  const passwordHash = await hashPassword(password);
  const admin = await prisma.employee.upsert({
    where: { email },
    create: { email, firstName: 'Admin', lastName: 'User', role: 'ADMIN', passwordHash },
    update: { role: 'ADMIN', passwordHash, active: true }
  });
  console.log(`Admin ready: id ${admin.id}, ${admin.email}`);
} finally {
  await prisma.$disconnect();
}
