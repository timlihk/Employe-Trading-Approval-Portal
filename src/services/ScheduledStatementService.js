const cron = require('node-cron');
const { logger } = require('../utils/logger');

class ScheduledStatementService {
  static cronJob = null;
  static reminderCronJob = null;
  static isRunning = false;
  static schedule = null;
  static reminderSchedule = '0 0 9 * * *'; // Daily at 9 AM HKT

  /**
   * Initialize the monthly statement request scheduler and daily reminder scheduler.
   * Monthly: 7th of every month at 9 AM HKT (initial emails).
   * Daily: Every day at 9 AM HKT (reminders for those who haven't uploaded).
   */
  static initialize(schedule = null) {
    const cronSchedule = schedule || process.env.STATEMENT_REQUEST_SCHEDULE || '0 0 9 7 * *';

    if (!cron.validate(cronSchedule)) {
      logger.error(`Invalid cron schedule for statement requests: ${cronSchedule}`);
      return false;
    }

    this.stop();
    this.schedule = cronSchedule;

    // Monthly job: send initial statement request emails
    this.cronJob = cron.schedule(cronSchedule, async () => {
      await this.executeScheduledRequest();
    }, {
      scheduled: true,
      timezone: 'Asia/Hong_Kong'
    });

    // Daily job: send reminders to those who haven't uploaded
    this.reminderCronJob = cron.schedule(this.reminderSchedule, async () => {
      await this.executeDailyReminders();
    }, {
      scheduled: true,
      timezone: 'Asia/Hong_Kong'
    });

    this.isRunning = true;
    logger.info(`Statement request scheduler initialized: ${cronSchedule}`);
    logger.info(`Daily reminder scheduler initialized: ${this.reminderSchedule}`);
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
   * Execute daily reminder emails for pending/overdue statement requests.
   * Skips the 7th of the month (already handled by the monthly job).
   */
  static async executeDailyReminders() {
    const today = new Date();
    const dayOfMonth = today.getDate();

    // Parse the monthly schedule to find which day it runs on
    const parts = (this.schedule || '').split(' ');
    const monthlyDay = parseInt(parts[3]);
    if (dayOfMonth === monthlyDay) {
      logger.info('Skipping daily reminders — monthly job runs today');
      return;
    }

    logger.info('Starting daily statement reminder check...');
    try {
      const StatementRequestService = require('./StatementRequestService');
      await StatementRequestService.markOverdueRequests();
      const sent = await StatementRequestService.sendReminders();
      logger.info(`Daily reminder check completed: ${sent} reminders sent`);
    } catch (error) {
      logger.error('Daily reminder check failed:', error.message);
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
    if (this.reminderCronJob) {
      this.reminderCronJob.stop();
      this.reminderCronJob = null;
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
      reminderSchedule: this.reminderSchedule,
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
