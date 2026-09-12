const cron = require('node-cron');
const { checkAndFlagExpiredSchools } = require('../services/subscription.service');
const logger = require('../utils/logger');

// Runs daily at 1:00 AM server time
function startExpiryJob() {
  cron.schedule('0 1 * * *', async () => {
    try {
      const result = await checkAndFlagExpiredSchools();
      logger.info('Subscription expiry check completed', result);
    } catch (err) {
      logger.error('Subscription expiry job failed', err);
    }
  });
}

module.exports = { startExpiryJob };