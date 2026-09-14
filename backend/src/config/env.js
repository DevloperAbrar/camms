require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD_HASH: process.env.SUPERADMIN_PASSWORD_HASH,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL_SCHOOL: process.env.GOOGLE_CALLBACK_URL_SCHOOL,
};

const requiredInProd = ['DATABASE_URL', 'JWT_SECRET', 'SUPERADMIN_EMAIL', 'SUPERADMIN_PASSWORD_HASH'];

if (env.NODE_ENV === 'production') {
  requiredInProd.forEach((key) => {
    if (!env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  });
}

module.exports = env;