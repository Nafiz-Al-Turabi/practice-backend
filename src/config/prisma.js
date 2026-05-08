const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({ adapter });

async function connectPrisma() {
  try {
    await prisma.$connect();
    console.log('Connected to database via Prisma');
  } catch (error) {
    console.error('Prisma connection error:', error.message);
    throw error;
  }
}

module.exports = {
  prisma,
  connectPrisma
};
