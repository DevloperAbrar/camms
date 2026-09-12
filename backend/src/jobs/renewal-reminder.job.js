const cron = require('node-cron');
const { sendRenewalReminders } = require('../services/subscription.service');
const logger = require('../utils/logger');

// Runs daily at 8:00 AM server time
function startReminderJob() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const result = await sendRenewalReminders();
      logger.info('Renewal reminder job completed', result);
    } catch (err) {
      logger.error('Renewal reminder job failed', err);
    }
  });
}

module.exports = { startReminderJob };