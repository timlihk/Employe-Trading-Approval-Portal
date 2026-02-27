const cron = require('node-cron');
const { logger } = require('../utils/logger');

class ScheduledStatementService {
  static cronJob = null;
  static isRunning = false;
  static schedule = null;

  /**
   * Initialize the monthly statement request scheduler.
   * Default: 7th of every month at 9 AM Hong Kong time (allows time for month-end statements).
   */
  static initialize(schedule = null) {
    const cronSchedule = schedule || process.env.STATEMENT_REQUEST_SCHEDULE || '0 0 9 7 * *';

    if (!cron.validate(cronSchedule)) {
      logger.error(`Invalid cron schedule for statement requests: ${cronSchedule}`);
      return false;
    }

    this.stop();
    this.schedule = cronSchedule;

    this.cronJob = cron.schedule(cronSchedule, async () => {
      await this.executeScheduledRequest();
    }, {
      scheduled: true,
      timezone: 'Asia/Hong_Kong'
    });

    this.isRunning = true;
    logger.info(`Statement request scheduler initialized: ${cronSchedule}`);
    logger.info(`Next statement request run: ${this.getNextScheduledTime(cronSchedule)}`);
    return true;
  }

  /**
   * Execute the scheduled monthly statement request cycle.
   */
  static async executeScheduledRequest() {
    logger.info('Starting scheduled monthly statement request...');
    try {
      // Lazy-require to avoid circular dependencies at startup
      const StatementRequestService = require('./StatementRequestService');
      const result = await StatementRequestService.executeMonthlyRequest();
      logger.info('Scheduled statement request completed:', result);

      // Also mark any overdue requests
      await StatementRequestService.markOverdueRequests();
    } catch (error) {
      logger.error('Scheduled statement request failed:', error.message);
    }
  }

  /**
   * Manual trigger (for admin UI).
   */
  static async triggerManual() {
    logger.info('Manual statement request triggered by admin');
    return await this.executeScheduledRequest();
  }

  /**
   * Stop the scheduler.
   */
  static stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
  }

  /**
   * Get scheduler status for admin display.
   */
  static getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: this.schedule,
      timezone: 'Asia/Hong_Kong',
      nextRun: this.isRunning ? this.getNextScheduledTime(this.schedule) : null
    };
  }

  /**
   * Calculate the next scheduled run time from a cron expression.
   */
  static getNextScheduledTime(schedule) {
    try {
      if (!schedule) return 'Unknown';
      // Parse cron schedule to get a readable next run estimate
      const parts = schedule.split(' ');
      if (parts.length < 6) return 'Unknown';

      const now = new Date();
      // For monthly schedules (day-of-month specified), estimate next run
      const dayOfMonth = parseInt(parts[3]);
      const hour = parseInt(parts[2]);
      const minute = parseInt(parts[1]);

      if (!isNaN(dayOfMonth) && !isNaN(hour) && !isNaN(minute)) {
        let next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hour, minute, 0);
        if (next <= now) {
          next = new Date(now.getFullYear(), now.getMonth() + 1, dayOfMonth, hour, minute, 0);
        }
        return next.toLocaleString('en-GB', { timeZone: 'Asia/Hong_Kong' });
      }
      return 'See cron schedule';
    } catch {
      return 'Unknown';
    }
  }
}

module.exports = ScheduledStatementService;
