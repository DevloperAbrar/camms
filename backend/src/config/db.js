const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

async function connectDB() {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL connected via Prisma');
  } catch (err) {
    logger.error('Database connection failed', err);
    process.exit(1);
  }
}

module.exports = { prisma, connectDB };