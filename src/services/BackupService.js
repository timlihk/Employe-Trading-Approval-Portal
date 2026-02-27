const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const AuditLog = require('../models/AuditLog');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const database = require('../models/database');
const { logger } = require('../utils/logger');

class BackupService {
  /**
   * Create a SQL dump backup (more portable than JSON)
   */
  static async createSQLBackup() {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    let sqlContent = `-- Trading Approval Portal Database Backup
-- Generated: ${new Date().toISOString()}
-- Database: PostgreSQL
-- Version: 2.0

-- Disable foreign key checks
SET session_replication_role = 'replica';

`;

    try {
      // Backup trading_requests table
      const requests = await TradingRequest.getAll();
      if (requests.length > 0) {
        sqlContent += '-- Trading Requests\n';
        sqlContent += 'DELETE FROM trading_requests;\n';
        for (const req of requests) {
          const values = [
            `'${req.uuid}'`,
            `'${req.employee_email}'`,
            `'${req.stock_name.replace(/'/g, "''")}'`,
            `'${req.ticker}'`,
            req.shares,
            req.share_price || 'NULL',
            req.total_value || 'NULL',
            `'${req.currency || 'USD'}'`,
            req.share_price_usd || 'NULL',
            req.total_value_usd || 'NULL',
            req.exchange_rate || 1,
            `'${req.trading_type}'`,
            `'${req.status}'`,
            req.rejection_reason ? `'${req.rejection_reason.replace(/'/g, "''")}'` : 'NULL',
            req.escalation_reason ? `'${req.escalation_reason.replace(/'/g, "''")}'` : 'NULL',
            req.escalation_status ? `'${req.escalation_status}'` : 'NULL',
            req.admin_notes ? `'${req.admin_notes.replace(/'/g, "''")}'` : 'NULL',
            `'${req.created_at}'`,
            req.processed_at ? `'${req.processed_at}'` : 'NULL'
          ];
          sqlContent += `INSERT INTO trading_requests (uuid, employee_email, stock_name, ticker, shares, share_price, total_value, currency, share_price_usd, total_value_usd, exchange_rate, trading_type, status, rejection_reason, escalation_reason, escalation_status, admin_notes, created_at, processed_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      // Backup restricted_stocks table
      const restrictedStocks = await RestrictedStock.getAll();
      if (restrictedStocks.length > 0) {
        sqlContent += '-- Restricted Stocks\n';
        sqlContent += 'DELETE FROM restricted_stocks;\n';
        for (const stock of restrictedStocks) {
          const values = [
            `'${stock.uuid}'`,
            `'${stock.ticker}'`,
            `'${stock.company_name.replace(/'/g, "''")}'`,
            stock.reason ? `'${stock.reason.replace(/'/g, "''")}'` : 'NULL',
            `'${stock.added_by}'`,
            `'${stock.created_at}'`,
            stock.updated_at ? `'${stock.updated_at}'` : 'NULL'
          ];
          sqlContent += `INSERT INTO restricted_stocks (uuid, ticker, company_name, reason, added_by, created_at, updated_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      // Backup audit_logs table (limit to last 10000 for performance)
      const auditLogs = await database.query(`
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 10000
      `);
      
      if (auditLogs.length > 0) {
        sqlContent += '-- Audit Logs (Last 10000 entries)\n';
        for (const log of auditLogs) {
          const values = [
            `'${log.uuid}'`,
            `'${log.user_email}'`,
            `'${log.user_type}'`,
            `'${log.action.replace(/'/g, "''")}'`,
            `'${log.target_type}'`,
            log.target_id ? `'${log.target_id}'` : 'NULL',
            log.details ? `'${log.details.replace(/'/g, "''")}'` : 'NULL',
            log.ip_address ? `'${log.ip_address}'` : 'NULL',
            log.user_agent ? `'${log.user_agent.replace(/'/g, "''")}'` : 'NULL',
            log.session_id ? `'${log.session_id}'` : 'NULL',
            `'${log.created_at}'`
          ];
          sqlContent += `INSERT INTO audit_logs (uuid, user_email, user_type, action, target_type, target_id, details, ip_address, user_agent, session_id, created_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      // Backup statement_requests table
      const statementRequests = await database.query('SELECT * FROM statement_requests ORDER BY created_at');
      if (statementRequests.length > 0) {
        sqlContent += '-- Statement Requests\n';
        sqlContent += 'DELETE FROM statement_requests;\n';
        for (const sr of statementRequests) {
          const values = [
            `'${sr.uuid}'`,
            sr.period_year,
            sr.period_month,
            `'${sr.employee_email}'`,
            sr.employee_name ? `'${sr.employee_name.replace(/'/g, "''")}'` : 'NULL',
            `'${sr.status}'`,
            `'${sr.upload_token}'`,
            sr.email_sent_at ? `'${sr.email_sent_at}'` : 'NULL',
            sr.email_message_id ? `'${sr.email_message_id}'` : 'NULL',
            sr.deadline_at ? `'${sr.deadline_at}'` : 'NULL',
            sr.uploaded_at ? `'${sr.uploaded_at}'` : 'NULL',
            sr.sharepoint_item_id ? `'${sr.sharepoint_item_id}'` : 'NULL',
            sr.sharepoint_file_url ? `'${sr.sharepoint_file_url.replace(/'/g, "''")}'` : 'NULL',
            sr.original_filename ? `'${sr.original_filename.replace(/'/g, "''")}'` : 'NULL',
            sr.file_size_bytes || 'NULL',
            sr.file_content_type ? `'${sr.file_content_type}'` : 'NULL',
            sr.notes ? `'${sr.notes.replace(/'/g, "''")}'` : 'NULL',
            sr.reminder_count || 0,
            sr.last_reminder_at ? `'${sr.last_reminder_at}'` : 'NULL',
            sr.brokerage_name ? `'${sr.brokerage_name.replace(/'/g, "''")}'` : 'NULL',
            `'${sr.created_at}'`,
            sr.updated_at ? `'${sr.updated_at}'` : 'NULL'
          ];
          sqlContent += `INSERT INTO statement_requests (uuid, period_year, period_month, employee_email, employee_name, status, upload_token, email_sent_at, email_message_id, deadline_at, uploaded_at, sharepoint_item_id, sharepoint_file_url, original_filename, file_size_bytes, file_content_type, notes, reminder_count, last_reminder_at, brokerage_name, created_at, updated_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      // Backup brokerage_accounts table
      const brokerageAccounts = await database.query('SELECT * FROM brokerage_accounts ORDER BY created_at');
      if (brokerageAccounts.length > 0) {
        sqlContent += '-- Brokerage Accounts\n';
        sqlContent += 'DELETE FROM brokerage_accounts;\n';
        for (const ba of brokerageAccounts) {
          const values = [
            `'${ba.uuid}'`,
            `'${ba.employee_email}'`,
            `'${ba.firm_name.replace(/'/g, "''")}'`,
            `'${ba.account_number.replace(/'/g, "''")}'`,
            `'${ba.created_at}'`,
            ba.updated_at ? `'${ba.updated_at}'` : 'NULL'
          ];
          sqlContent += `INSERT INTO brokerage_accounts (uuid, employee_email, firm_name, account_number, created_at, updated_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      // Backup employee_profiles table
      const employeeProfiles = await database.query('SELECT * FROM employee_profiles ORDER BY created_at');
      if (employeeProfiles.length > 0) {
        sqlContent += '-- Employee Profiles\n';
        sqlContent += 'DELETE FROM employee_profiles;\n';
        for (const ep of employeeProfiles) {
          const values = [
            `'${ep.uuid}'`,
            `'${ep.employee_email}'`,
            ep.accounts_confirmed_at ? `'${ep.accounts_confirmed_at}'` : 'NULL',
            `'${ep.created_at}'`,
            ep.updated_at ? `'${ep.updated_at}'` : 'NULL'
          ];
          sqlContent += `INSERT INTO employee_profiles (uuid, employee_email, accounts_confirmed_at, created_at, updated_at) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }

      sqlContent += "-- Re-enable foreign key checks\nSET session_replication_role = 'origin';\n";

      return {
        content: sqlContent,
        filename: `trading_approval_backup_${timestamp}.sql`,
        format: 'sql'
      };
    } catch (error) {
      logger.error('SQL backup creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Store backup locally on the server (for Railway persistent volume)
   */
  static async storeBackupLocally(backupData, maxBackups = 5) {
    try {
      // Determine the best directory for backups
      let baseDir;
      let usingVolume = false;
      
      // Check if Railway volume path is configured AND accessible
      if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
        const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
        try {
          // Test if the volume path exists and is writable
          await fs.access(volumePath, fs.constants.W_OK);
          baseDir = volumePath;
          usingVolume = true;
          logger.info(`Using Railway persistent volume at ${volumePath}`);
        } catch (err) {
          // Volume path not accessible, fall back to /tmp
          logger.warn(`Railway volume path ${volumePath} not accessible: ${err.message}`);
          logger.warn('Falling back to /tmp. Please ensure volume is properly mounted.');
          baseDir = '/tmp';
        }
      } else if (process.env.RAILWAY_ENVIRONMENT) {
        // On Railway but no volume configured
        baseDir = '/tmp';
        logger.warn('Using /tmp for backups. Configure RAILWAY_VOLUME_MOUNT_PATH and mount a volume for permanent storage.');
      } else {
        // Local development
        baseDir = process.cwd();
      }
      
      const backupsDir = path.join(baseDir, 'backups');
      
      // Create backups directory with better error handling
      try {
        await fs.mkdir(backupsDir, { recursive: true, mode: 0o755 });
        logger.info(`Backup directory ready at ${backupsDir}`);
      } catch (err) {
        // Try to create parent directory first if needed
        if (err.code === 'ENOENT') {
          try {
            await fs.mkdir(baseDir, { recursive: true, mode: 0o755 });
            await fs.mkdir(backupsDir, { recursive: true, mode: 0o755 });
            logger.info(`Created backup directory at ${backupsDir}`);
          } catch (retryErr) {
            logger.error(`Failed to create backup directory: ${retryErr.message}`);
            // If we still can't create it, fall back to /tmp
            if (baseDir !== '/tmp') {
              logger.warn('Falling back to /tmp due to directory creation failure');
              baseDir = '/tmp';
              backupsDir = path.join(baseDir, 'backups');
              await fs.mkdir(backupsDir, { recursive: true, mode: 0o755 });
            } else {
              throw retryErr;
            }
          }
        } else {
          logger.warn(`Could not create backups directory: ${err.message}`);
        }
      }

      // Write the new backup
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `backup_${timestamp}.json`;
      const filepath = path.join(backupsDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(backupData, null, 2));
      
      // Clean up old backups (keep only the latest N)
      const files = await fs.readdir(backupsDir);
      const backupFiles = files
        .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
        .sort()
        .reverse();
      
      // Delete old backups beyond the limit
      for (let i = maxBackups; i < backupFiles.length; i++) {
        await fs.unlink(path.join(backupsDir, backupFiles[i]));
        logger.info(`Deleted old backup: ${backupFiles[i]}`);
      }
      
      logger.info(`Backup stored locally: ${filename}`);
      return { 
        success: true, 
        filename,
        path: filepath,
        size: (await fs.stat(filepath)).size
      };
    } catch (error) {
      logger.error('Failed to store backup locally', { error: error.message });
      throw error;
    }
  }

  /**
   * List available local backups
   */
  static async listLocalBackups() {
    try {
      // Try multiple locations in order of preference
      const possibleDirs = [];
      
      // First try Railway volume if configured
      if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
        possibleDirs.push(path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'backups'));
      }
      
      // Then try /tmp on Railway
      if (process.env.RAILWAY_ENVIRONMENT) {
        possibleDirs.push(path.join('/tmp', 'backups'));
      }
      
      // Finally try local directory
      possibleDirs.push(path.join(process.cwd(), 'backups'));
      
      // Find the first directory that exists and has backups
      let backupsDir = null;
      let allBackups = [];
      
      for (const dir of possibleDirs) {
        try {
          await fs.access(dir);
          const files = await fs.readdir(dir);
          const backupFiles = files.filter(f => f.startsWith('backup_') && f.endsWith('.json'));
          
          if (backupFiles.length > 0) {
            // Found backups in this directory
            const backupsFromDir = await Promise.all(
              backupFiles.map(async (filename) => {
                const filepath = path.join(dir, filename);
                const stats = await fs.stat(filepath);
                return {
                  filename,
                  size: stats.size,
                  created: stats.mtime,
                  path: filepath,
                  location: dir
                };
              })
            );
            allBackups = allBackups.concat(backupsFromDir);
          }
        } catch (err) {
          // Directory doesn't exist or not accessible, continue to next
          continue;
        }
      }
      
      // Return all found backups sorted by date
      return allBackups.sort((a, b) => b.created - a.created);
      
    } catch (error) {
      logger.error('Failed to list local backups', { error: error.message });
      return [];
    }
  }

  /**
   * Restore from a backup file (JSON format)
   */
  static async restoreFromBackup(backupData) {
    const results = {
      success: false,
      restored: {},
      errors: []
    };

    try {
      // Validate backup structure
      if (!backupData.metadata || !backupData.metadata.version) {
        throw new Error('Invalid backup format - missing metadata');
      }

      // Start transaction
      await database.query('BEGIN');

      // Restore trading_requests
      if (backupData.trading_requests) {
        try {
          await database.query('DELETE FROM trading_requests');
          let count = 0;
          for (const req of backupData.trading_requests) {
            await TradingRequest.create(req);
            count++;
          }
          results.restored.trading_requests = count;
        } catch (error) {
          results.errors.push(`Trading requests: ${error.message}`);
        }
      }

      // Restore restricted_stocks
      if (backupData.restricted_stocks) {
        try {
          await database.query('DELETE FROM restricted_stocks');
          let count = 0;
          for (const stock of backupData.restricted_stocks) {
            await RestrictedStock.add(
              stock.ticker,
              stock.company_name,
              stock.reason,
              stock.added_by
            );
            count++;
          }
          results.restored.restricted_stocks = count;
        } catch (error) {
          results.errors.push(`Restricted stocks: ${error.message}`);
        }
      }

      // Commit transaction
      await database.query('COMMIT');
      results.success = results.errors.length === 0;
      
    } catch (error) {
      await database.query('ROLLBACK');
      results.errors.push(`Transaction failed: ${error.message}`);
    }

    return results;
  }
}

module.exports = BackupService;