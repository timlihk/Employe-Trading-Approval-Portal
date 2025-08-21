const cron = require('node-cron');
const BackupService = require('./BackupService');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const AuditLog = require('../models/AuditLog');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const database = require('../models/database');
const { logger } = require('../utils/logger');

class ScheduledBackupService {
  static cronJob = null;
  static isRunning = false;

  /**
   * Initialize the scheduled backup service
   * Default schedule: Daily at 2 AM (Hong Kong time)
   */
  static initialize(schedule = null) {
    // Use provided schedule or default to 2 AM daily
    // Cron format: second minute hour day month day-of-week
    const cronSchedule = schedule || process.env.BACKUP_SCHEDULE || '0 0 2 * * *';
    
    // Validate cron expression
    if (!cron.validate(cronSchedule)) {
      logger.error('Invalid cron schedule for backups:', cronSchedule);
      return false;
    }

    // Stop any existing job
    this.stop();

    // Schedule the backup job
    this.cronJob = cron.schedule(cronSchedule, async () => {
      await this.performScheduledBackup();
    }, {
      scheduled: true,
      timezone: 'Asia/Hong_Kong' // Use Hong Kong timezone
    });

    logger.info(`Scheduled backup service initialized with schedule: ${cronSchedule}`);
    logger.info('Backups will run in Asia/Hong_Kong timezone');
    
    // Also log next scheduled run
    const nextRun = this.getNextScheduledTime(cronSchedule);
    if (nextRun) {
      logger.info(`Next backup scheduled for: ${nextRun.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`);
    }

    this.isRunning = true;
    return true;
  }

  /**
   * Perform the scheduled backup
   */
  static async performScheduledBackup() {
    const startTime = Date.now();
    logger.info('Starting scheduled automatic backup...');

    try {
      // Check if database is available
      if (!database.getPool()) {
        logger.error('Database not available for scheduled backup');
        return;
      }

      // Create backup data
      const backupData = {
        metadata: {
          backup_date: new Date().toISOString(),
          database_type: 'PostgreSQL',
          version: '2.0',
          admin_user: 'SYSTEM_SCHEDULED',
          backup_type: 'automatic',
          notes: 'Automated daily backup'
        }
      };

      // Collect all data
      try {
        backupData.trading_requests = await TradingRequest.getAll();
        backupData.restricted_stocks = await RestrictedStock.getAll();
        backupData.audit_logs = await AuditLog.getAuditLogs({});
        backupData.restricted_stock_changelog = await RestrictedStockChangelog.getAll();
      } catch (error) {
        logger.error('Error collecting data for scheduled backup:', error);
        throw error;
      }

      // Store backup locally
      const result = await BackupService.storeBackupLocally(backupData, 7); // Keep 7 days of automatic backups
      
      const duration = Date.now() - startTime;
      
      // Log the successful backup
      await AuditLog.logActivity(
        'SYSTEM',
        'admin',
        'scheduled_backup_completed',
        'system',
        null,
        `Automatic backup completed: ${result.filename} (${Math.round(result.size / 1024)} KB) in ${duration}ms`,
        '127.0.0.1'
      );

      logger.info(`Scheduled backup completed successfully`, {
        filename: result.filename,
        size: `${Math.round(result.size / 1024)} KB`,
        duration: `${duration}ms`,
        recordCounts: {
          trading_requests: backupData.trading_requests?.length || 0,
          restricted_stocks: backupData.restricted_stocks?.length || 0,
          audit_logs: backupData.audit_logs?.data?.length || backupData.audit_logs?.length || 0,
          changelog: backupData.restricted_stock_changelog?.length || 0
        }
      });

      // Clean up old automatic backups (keep last 7 days)
      await this.cleanupOldBackups();
      
    } catch (error) {
      logger.error('Scheduled backup failed:', error);
      
      // Log the failure
      try {
        await AuditLog.logActivity(
          'SYSTEM',
          'admin',
          'scheduled_backup_failed',
          'system',
          null,
          `Automatic backup failed: ${error.message}`,
          '127.0.0.1'
        );
      } catch (logError) {
        logger.error('Could not log backup failure to audit log:', logError);
      }
    }
  }

  /**
   * Clean up old automatic backups
   */
  static async cleanupOldBackups() {
    try {
      const backups = await BackupService.listLocalBackups();
      
      // Filter for automatic backups (you might want to distinguish these)
      // Keep only the last 7 automatic backups
      const sortedBackups = backups.sort((a, b) => b.created - a.created);
      
      if (sortedBackups.length > 7) {
        const fs = require('fs').promises;
        const toDelete = sortedBackups.slice(7);
        
        for (const backup of toDelete) {
          try {
            await fs.unlink(backup.path);
            logger.info(`Deleted old automatic backup: ${backup.filename}`);
          } catch (err) {
            logger.warn(`Could not delete old backup ${backup.filename}:`, err.message);
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up old backups:', error);
    }
  }

  /**
   * Manually trigger a backup (for testing or on-demand)
   */
  static async triggerManualBackup() {
    logger.info('Manual backup triggered');
    return await this.performScheduledBackup();
  }

  /**
   * Stop the scheduled backup service
   */
  static stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.isRunning = false;
      logger.info('Scheduled backup service stopped');
    }
  }

  /**
   * Get the status of the backup scheduler
   */
  static getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: process.env.BACKUP_SCHEDULE || '0 0 2 * * *',
      timezone: 'Asia/Hong_Kong',
      nextRun: this.cronJob ? this.getNextScheduledTime() : null
    };
  }

  /**
   * Calculate next scheduled time (approximate)
   */
  static getNextScheduledTime(schedule = null) {
    const cronSchedule = schedule || process.env.BACKUP_SCHEDULE || '0 0 2 * * *';
    
    // Parse the cron expression to determine next run
    // For daily at 2 AM, calculate next 2 AM
    const now = new Date();
    const next = new Date();
    
    // Simple parser for daily schedules (format: "0 0 2 * * *")
    const parts = cronSchedule.split(' ');
    if (parts.length >= 3) {
      const hour = parseInt(parts[2]);
      if (!isNaN(hour)) {
        next.setHours(hour, 0, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next;
      }
    }
    
    return null;
  }
}

module.exports = ScheduledBackupService;