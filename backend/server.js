const app = require('./app');
const { connectDB } = require('./src/config/db');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { startExpiryJob } = require('./src/jobs/subscription-expiry.job');
const { startReminderJob } = require('./src/jobs/renewal-reminder.job');

async function startServer() {
  await connectDB();

  startExpiryJob();
  startReminderJob();

  app.listen(env.PORT, () => {
    logger.info(`AMMS backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

startServer();