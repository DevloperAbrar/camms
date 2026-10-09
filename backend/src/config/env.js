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

  // Cloudflare R2 (Notes file storage). Optional: Notes uploads return 503 until these are set.
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: process.env.R2_BUCKET,
  R2_ENDPOINT: process.env.R2_ENDPOINT,
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