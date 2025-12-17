const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const [row] = await prisma.$queryRawUnsafe('SELECT 1 as x');
    console.log('Prisma Client SELECT OK', row);
  } catch (e) {
    console.error('Prisma Client connection FAILED');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
