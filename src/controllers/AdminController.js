const AdminService = require('../services/AdminService');
const BackupService = require('../services/BackupService');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const AuditLog = require('../models/AuditLog');
const database = require('../models/database');
const { catchAsync } = require('../middleware/errorHandler');
const { renderAdminPage, generateNotificationBanner } = require('../utils/templates');
const { getDisplayId } = require('../utils/formatters');
const { formatHongKongTime } = require('../templates/shared/formatters');

// Template imports
const { dashboardTemplate } = require('../templates/admin/dashboard');
const { requestsTemplate } = require('../templates/admin/requests');
const { rejectFormTemplate } = require('../templates/admin/rejectForm');
const { restrictedStocksTemplate } = require('../templates/admin/restrictedStocks');
const { auditLogTemplate } = require('../templates/admin/auditLog');
const { backupSchedulerTemplate } = require('../templates/admin/backupScheduler');
const { backupListTemplate } = require('../templates/admin/backupList');
const { clearDatabaseTemplate } = require('../templates/admin/clearDatabase');

class AdminController {
  /**
   * Authenticate admin user
   */
  authenticateAdmin = catchAsync(async (req, res) => {
    const { username, password } = req.body;

    const result = await AdminService.authenticateAdmin(username, password);

    if (result.authenticated) {
      req.session.admin = { username: result.username };
      res.redirect('/admin-dashboard');
    } else {
      res.redirect('/admin-login?error=invalid_credentials');
    }
  });

  /**
   * Add restricted stock
   */
  addRestrictedStock = catchAsync(async (req, res) => {
    const { ticker } = req.body;
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    try {
      const result = await AdminService.addRestrictedStock(ticker, adminEmail, ipAddress);
      res.redirect('/admin-restricted-stocks?message=stock_added&ticker=' + encodeURIComponent(result.ticker));
    } catch (error) {
      if (error.statusCode === 409) {
        // Duplicate entry error
        res.redirect('/admin-restricted-stocks?error=already_exists&ticker=' + encodeURIComponent(ticker.toUpperCase()));
      } else {
        // Re-throw other errors to be handled by catchAsync
        throw error;
      }
    }
  });

  /**
   * Remove restricted stock
   */
  removeRestrictedStock = catchAsync(async (req, res) => {
    const { ticker } = req.body;
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    await AdminService.removeRestrictedStock(ticker, adminEmail, ipAddress);

    res.redirect('/admin-restricted-stocks?message=stock_removed&ticker=' + encodeURIComponent(ticker.toUpperCase()));
  });

  /**
   * Approve trading request
   */
  approveRequest = catchAsync(async (req, res) => {
    const requestUuid = req.body.requestId || req.params.id; // Now UUID
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    await AdminService.approveRequest(requestUuid, adminEmail, ipAddress);

    res.redirect('/admin-requests?message=request_approved');
  });

  /**
   * Reject trading request
   */
  rejectRequest = catchAsync(async (req, res) => {
    const requestUuid = req.body.requestId || req.params.id; // Now UUID
    const { rejection_reason } = req.body;
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    await AdminService.rejectRequest(requestUuid, rejection_reason, adminEmail, ipAddress);

    res.redirect('/admin-requests?message=request_rejected');
  });

  /**
   * Get admin dashboard
   */
  getDashboard = catchAsync(async (req, res) => {
    const banner = generateNotificationBanner(req.query);

    const [pendingCount, escalatedCount, todayCount, restrictedCount] = await Promise.all([
      TradingRequest.countByStatus('pending'),
      TradingRequest.countEscalated(),
      TradingRequest.countToday(),
      RestrictedStock.getCount()
    ]);

    const content = dashboardTemplate({ banner, pendingCount, escalatedCount, todayCount, restrictedCount });
    res.send(renderAdminPage('Administrator Dashboard', content));
  });

  /**
   * Get admin requests page
   */
  getRequests = catchAsync(async (req, res) => {
    const { message, employee_email, start_date, end_date, ticker, trading_type, status, escalated, instrument_type, sort_by = 'created_at', sort_order = 'DESC', page = 1, limit = 25 } = req.query;
    let banner = '';

    if (message === 'request_approved') {
      banner = generateNotificationBanner('Trading request approved successfully', 'success');
    } else if (message === 'request_rejected') {
      banner = generateNotificationBanner('Trading request rejected successfully', 'success');
    }

    // Validate pagination params
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(50, Math.max(1, parseInt(limit) || 25));

    // Build filters based on query parameters
    const filters = {
      page: validatedPage,
      limit: validatedLimit
    };
    if (employee_email) filters.employee_email = employee_email;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (ticker) filters.ticker = ticker.toUpperCase();
    if (trading_type) filters.trading_type = trading_type;
    if (status) filters.status = status;
    if (instrument_type) filters.instrument_type = instrument_type;
    if (escalated === 'true') filters.escalated = true;
    if (escalated === 'false') filters.escalated = false;

    // Get requests with pagination
    const result = await TradingRequest.getFilteredHistory(filters, sort_by, sort_order);

    // Handle database errors gracefully
    if (!result || !result.data) {
      console.error('AdminController.getRequests: Database returned no data', { result, filters });
      throw new Error('Unable to fetch trading requests - database returned no data');
    }

    const content = requestsTemplate({
      banner,
      allRequests: result.data,
      pagination: result.pagination,
      filters: { employee_email, start_date, end_date, ticker, trading_type, status, escalated, instrument_type },
      csrfInput: req.csrfInput(),
      currentSortBy: req.query.sort_by || 'created_at',
      currentSortOrder: req.query.sort_order || 'DESC',
      queryParams: req.query
    });

    res.send(renderAdminPage('Trading Requests', content));
  });

  /**
   * Get reject form page
   */
  getRejectForm = catchAsync(async (req, res) => {
    const requestUuid = req.params.requestId; // Now UUID

    // Get the request details
    const request = await TradingRequest.getByUuid(requestUuid);
    if (!request) {
      return res.redirect('/admin-requests?error=request_not_found');
    }

    const content = rejectFormTemplate({
      requestUuid,
      request,
      csrfInput: req.csrfInput()
    });

    res.send(renderAdminPage('Reject Trading Request', content));
  });

  /**
   * Get restricted stocks page
   */
  getRestrictedStocks = catchAsync(async (req, res) => {
    const { message, ticker, error, sort_by = 'ticker', sort_order = 'ASC' } = req.query;
    let banner = '';

    if (message === 'stock_added' && ticker) {
      banner = generateNotificationBanner(`${ticker} has been successfully added to the restricted instruments list`, 'success');
    } else if (message === 'stock_removed' && ticker) {
      banner = generateNotificationBanner(`${ticker} has been successfully removed from the restricted instruments list`, 'success');
    } else if (error === 'already_exists' && ticker) {
      banner = generateNotificationBanner(`${ticker} is already in the restricted instruments list`, 'error');
    } else if (error === 'not_found' && ticker) {
      banner = generateNotificationBanner(`${ticker} is not in the restricted instruments list`, 'error');
    }

    // Get restricted stocks with sorting
    const sortMap = {
      'ticker': 'ticker',
      'company_name': 'company_name',
      'created_at': 'created_at'
    };
    const validSortBy = sortMap[sort_by] || 'ticker';
    const validSortOrder = sort_order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const restrictedStocks = await RestrictedStock.findAll({}, `${validSortBy} ${validSortOrder}`);
    const changelog = await RestrictedStockChangelog.getRecentChanges(20);

    // Fix company names for bonds that show "Added via Admin Panel"
    const ISINServiceClass = require('../services/ISINService');
    const isinService = ISINServiceClass.instance;

    for (const stock of restrictedStocks) {
      if (stock.company_name === 'Added via Admin Panel' && ISINServiceClass.detectISIN(stock.ticker)) {
        try {
          const isinResult = await isinService.validateISIN(stock.ticker);
          if (isinResult.valid) {
            if (isinResult.issuer && isinResult.issuer !== 'Unknown Issuer') {
              stock.company_name = isinResult.issuer;
            } else if (isinResult.name && isinResult.name !== `Bond ${stock.ticker}`) {
              stock.company_name = isinResult.name;
            } else {
              // Use country-based fallback
              const countryCode = stock.ticker.substring(0, 2).toUpperCase();
              stock.company_name = `${countryCode} Government/Corporate Bond`;
            }
          }
        } catch (error) {
          // Keep original name if ISIN lookup fails
          console.error('Error looking up ISIN', { ticker: stock.ticker, error: error.message });
        }
      }
    }

    // Fix company names in changelog too
    for (const change of changelog) {
      if (change.company_name === 'Added via Admin Panel' && ISINServiceClass.detectISIN(change.ticker)) {
        try {
          const isinResult = await isinService.validateISIN(change.ticker);
          if (isinResult.valid) {
            if (isinResult.issuer && isinResult.issuer !== 'Unknown Issuer') {
              change.company_name = isinResult.issuer;
            } else if (isinResult.name && isinResult.name !== `Bond ${change.ticker}`) {
              change.company_name = isinResult.name;
            } else {
              // Use country-based fallback
              const countryCode = change.ticker.substring(0, 2).toUpperCase();
              change.company_name = `${countryCode} Government/Corporate Bond`;
            }
          }
        } catch (error) {
          // Keep original name if ISIN lookup fails
          console.error('Error looking up ISIN in changelog', { ticker: change.ticker, error: error.message });
        }
      }
    }

    const content = restrictedStocksTemplate({
      banner,
      restrictedStocks,
      changelog,
      csrfInput: req.csrfInput(),
      sortBy: sort_by,
      sortOrder: sort_order,
      queryParams: req.query
    });

    res.send(renderAdminPage('Restricted Stocks', content));
  });

  /**
   * Export trading requests as CSV
   */
  exportTradingRequests = catchAsync(async (req, res) => {
    const { sort_by = 'created_at', sort_order = 'DESC' } = req.query;

    try {
      // Get all trading requests with current sorting
      const requests = await TradingRequest.getAll(sort_by, sort_order);

      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `trading-requests-export-${timestamp}.csv`;

      let csvContent = 'Request ID,Date Created,Employee Email,Stock Name,Ticker,Trading Type,Shares,Estimated Value (USD),Status,Escalated,Escalation Reason,Processed Date\n';

      requests.forEach(request => {
        const createdDate = new Date(request.created_at).toLocaleDateString('en-GB');
        const stockName = (request.stock_name || 'N/A').replace(/"/g, '""');
        const estimatedValue = (request.total_value_usd || request.total_value || 0);
        const escalated = request.escalated ? 'Yes' : 'No';
        const escalationReason = (request.escalation_reason || '').replace(/"/g, '""');
        const processedDate = request.processed_at ? new Date(request.processed_at).toLocaleDateString('en-GB') : 'N/A';

        const sanitizeCsv = (v) => {
  const s = String(v ?? '');
  const needsEscape = /^[=+\-@]/.test(s);
  const escapedQuotes = s.replace(/"/g, '""');
  return needsEscape ? `'${escapedQuotes}` : escapedQuotes;
};
csvContent += `"${sanitizeCsv(getDisplayId(request))}","${sanitizeCsv(createdDate)}","${sanitizeCsv(request.employee_email)}","${sanitizeCsv(stockName)}","${sanitizeCsv(request.ticker)}","${sanitizeCsv(request.trading_type.toUpperCase())}","${sanitizeCsv(request.shares)}","${sanitizeCsv(estimatedValue)}","${sanitizeCsv(request.status.toUpperCase())}","${sanitizeCsv(escalated)}","${sanitizeCsv(escalationReason)}","${sanitizeCsv(processedDate)}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        error: 'Failed to export trading requests',
        details: error.message
      });
    }
  });

  /**
   * Backup database - complete export of all data
   */
  backupDatabase = catchAsync(async (req, res) => {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

      // Get comprehensive backup data from all tables
      const backupData = {
        metadata: {
          backup_date: new Date().toISOString(),
          database_type: 'PostgreSQL',
          version: '2.0',
          admin_user: req.session.admin.username,
          app_version: 'Employee Trading Approval Portal',
          notes: 'Complete database backup including all tables and data'
        }
      };

      // Get ALL trading requests (no limit)
      const requests = await TradingRequest.getAll();
      backupData.trading_requests = requests;

      // Get ALL restricted stocks
      const restrictedStocks = await RestrictedStock.getAll();
      backupData.restricted_stocks = restrictedStocks;

      // Get ALL audit logs (remove limit to get everything)
      const auditLogs = await AuditLog.getAuditLogs({});
      backupData.audit_logs = auditLogs;

      // Get ALL restricted stock changelog
      const changelog = await RestrictedStockChangelog.getAll();
      backupData.restricted_stock_changelog = changelog;

      // Get session data (if exists) - for recovery purposes
      try {
        const sessionData = await database.query(`
          SELECT session_id, data, expire
          FROM session
          WHERE expire > NOW()
          ORDER BY expire DESC
          LIMIT 50
        `);
        backupData.active_sessions = sessionData;
      } catch (error) {
        // Session table might not exist or might be different structure
        backupData.active_sessions = [];
        console.log('Session data not included in backup:', error.message);
      }

      // Get database statistics for verification
      try {
        const stats = await database.query(`
          SELECT
            'trading_requests' as table_name,
            COUNT(*) as record_count
          FROM trading_requests
          UNION ALL
          SELECT
            'restricted_stocks' as table_name,
            COUNT(*) as record_count
          FROM restricted_stocks
          UNION ALL
          SELECT
            'audit_logs' as table_name,
            COUNT(*) as record_count
          FROM audit_logs
          UNION ALL
          SELECT
            'restricted_stock_changelog' as table_name,
            COUNT(*) as record_count
          FROM restricted_stock_changelog
        `);
        backupData.statistics = stats;
      } catch (error) {
        backupData.statistics = [];
        console.log('Statistics not included in backup:', error.message);
      }

      // Generate comprehensive JSON backup file
      const jsonContent = JSON.stringify(backupData, null, 2);
      const filename = `trading_approval_complete_backup_${timestamp}.json`;

      // Log the backup operation
      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_backup',
        'system',
        null,
        `Complete database backup created - ${Object.keys(backupData).length - 1} data sections exported`,
        req.ip
      );

      console.log('✅ Database backup created successfully', {
        filename,
        admin: req.session.admin.username,
        tables: Object.keys(backupData).filter(key => key !== 'metadata'),
        size: `${Math.round(jsonContent.length / 1024)} KB`
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonContent);

    } catch (error) {
      console.error('❌ Database backup error:', error);

      // Log the failed backup attempt
      try {
        await AuditLog.logActivity(
          req.session.admin.username,
          'admin',
          'database_backup_failed',
          'system',
          null,
          `Database backup failed: ${error.message}`,
          req.ip
        );
      } catch (logError) {
        console.error('Failed to log backup error:', logError);
      }

      res.status(500).json({
        error: 'Failed to create database backup',
        details: error.message
      });
    }
  });

  /**
   * Create SQL backup and store locally
   */
  backupDatabaseSQL = catchAsync(async (req, res) => {
    try {
      // Create SQL backup
      const backup = await BackupService.createSQLBackup();

      // Log the backup operation
      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_backup_sql',
        'system',
        null,
        `SQL database backup created - ${backup.filename}`,
        req.ip
      );

      console.log('✅ SQL database backup created successfully', {
        filename: backup.filename,
        admin: req.session.admin.username,
        size: `${Math.round(backup.content.length / 1024)} KB`
      });

      // Send SQL file for download
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      res.send(backup.content);

    } catch (error) {
      console.error('❌ SQL database backup error:', error);

      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_backup_sql_failed',
        'system',
        null,
        `SQL backup failed: ${error.message}`,
        req.ip
      );

      res.status(500).json({
        error: 'Failed to create SQL backup',
        details: error.message
      });
    }
  });

  /**
   * Store backup locally on server
   */
  storeBackup = catchAsync(async (req, res) => {
    try {
      // Get backup data first
      const backupData = {
        metadata: {
          backup_date: new Date().toISOString(),
          database_type: 'PostgreSQL',
          version: '2.0',
          admin_user: req.session.admin.username
        }
      };

      // Get all data
      backupData.trading_requests = await TradingRequest.getAll();
      backupData.restricted_stocks = await RestrictedStock.getAll();
      backupData.audit_logs = await AuditLog.getAuditLogs({});
      backupData.restricted_stock_changelog = await RestrictedStockChangelog.getAll();

      // Store backup locally
      const result = await BackupService.storeBackupLocally(backupData);

      // Log the operation
      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_backup_stored',
        'system',
        null,
        `Backup stored locally: ${result.filename} (${Math.round(result.size / 1024)} KB)`,
        req.ip
      );

      // Redirect with success message
      res.redirect('/admin-backup-list?message=backup_stored');

    } catch (error) {
      console.error('❌ Store backup error:', error);

      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_backup_store_failed',
        'system',
        null,
        `Store backup failed: ${error.message}`,
        req.ip
      );

      res.redirect('/admin-backup-list?error=' + encodeURIComponent('Failed to store backup'));
    }
  });

  /**
   * List stored backups
   */
  listBackups = catchAsync(async (req, res) => {
    const { message, error } = req.query;

    // Get list of stored backups
    const backups = await BackupService.listLocalBackups();

    let notification = '';
    if (message === 'backup_stored') {
      notification = generateNotificationBanner('Backup stored successfully!', 'success');
    } else if (message === 'manual_backup_triggered') {
      notification = generateNotificationBanner('Manual backup triggered successfully! Check back in a moment.', 'success');
    } else if (error) {
      notification = generateNotificationBanner(error, 'error');
    }

    // Get scheduler status
    const ScheduledBackupService = require('../services/ScheduledBackupService');
    const schedulerStatus = ScheduledBackupService.getStatus();

    // Compute storage description
    const storageDescription = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? `Persistent volume at ${process.env.RAILWAY_VOLUME_MOUNT_PATH}/backups`
      : process.env.RAILWAY_ENVIRONMENT
        ? 'Temporary storage at /tmp/backups (Configure volume for persistence)'
        : 'Local directory';

    const content = backupListTemplate({
      notification,
      backups,
      schedulerStatus,
      csrfInput: req.csrfInput(),
      storageDescription
    });

    res.send(renderAdminPage('Backup Management', content));
  });

  /**
   * Download a stored backup
   */
  downloadBackup = catchAsync(async (req, res) => {
    const { filename } = req.query;

    if (!filename) {
      return res.status(400).send('Filename required');
    }

    // Security: Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || !filename.startsWith('backup_')) {
      return res.status(400).send('Invalid filename');
    }

    const fs = require('fs').promises;
    const path = require('path');

    try {
      // Try to find the backup file in multiple locations
      const possiblePaths = [];

      if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
        possiblePaths.push(path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'backups', filename));
      }
      if (process.env.RAILWAY_ENVIRONMENT) {
        possiblePaths.push(path.join('/tmp', 'backups', filename));
      }
      possiblePaths.push(path.join(process.cwd(), 'backups', filename));

      let content = null;
      let foundPath = null;

      // Try each possible path
      for (const filepath of possiblePaths) {
        try {
          content = await fs.readFile(filepath, 'utf8');
          foundPath = filepath;
          break;
        } catch (err) {
          // File not found at this path, try next
          continue;
        }
      }

      if (!content) {
        throw new Error('Backup file not found in any location');
      }

      // Log the download
      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'backup_downloaded',
        'system',
        null,
        `Downloaded backup: ${filename}`,
        req.ip
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);

    } catch (error) {
      console.error('Download backup error:', error);
      res.status(404).send('Backup file not found');
    }
  });

  /**
   * Show backup scheduler status
   */
  backupSchedulerStatus = catchAsync(async (req, res) => {
    const ScheduledBackupService = require('../services/ScheduledBackupService');
    const status = ScheduledBackupService.getStatus();

    const content = backupSchedulerTemplate({
      status,
      csrfInput: req.csrfInput()
    });

    res.send(renderAdminPage('Backup Scheduler Status', content));
  });

  /**
   * Trigger manual backup
   */
  triggerManualBackup = catchAsync(async (req, res) => {
    const ScheduledBackupService = require('../services/ScheduledBackupService');

    try {
      await ScheduledBackupService.triggerManualBackup();

      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'manual_scheduled_backup_triggered',
        'system',
        null,
        'Manual backup triggered through scheduler',
        req.ip
      );

      res.redirect('/admin-backup-list?message=manual_backup_triggered');
    } catch (error) {
      logger.error('Manual backup trigger failed:', error);
      res.redirect('/admin-backup-list?error=' + encodeURIComponent('Failed to trigger backup: ' + error.message));
    }
  });

  /**
   * Clear database - reset to brand new state
   */
  clearDatabase = catchAsync(async (req, res) => {
    try {
      // Clear all data from all tables
      await database.query('DELETE FROM audit_logs');
      await database.query('DELETE FROM restricted_stock_changelog');
      await database.query('DELETE FROM trading_requests');
      await database.query('DELETE FROM restricted_stocks');

      // Reset sequences to start from 1
      await database.query('ALTER SEQUENCE audit_logs_id_seq RESTART WITH 1');
      await database.query('ALTER SEQUENCE restricted_stock_changelog_id_seq RESTART WITH 1');
      await database.query('ALTER SEQUENCE trading_requests_id_seq RESTART WITH 1');
      await database.query('ALTER SEQUENCE restricted_stocks_id_seq RESTART WITH 1');

      // Log this critical action
      await AuditLog.logActivity(
        req.session.admin.username,
        'admin',
        'database_reset',
        'system',
        null,
        'Complete database reset performed - all data cleared',
        req.ip
      );

      res.redirect('/admin-dashboard?message=database_cleared');

    } catch (error) {
      console.error('Database clear error:', error);
      res.status(500).json({
        error: 'Failed to clear database',
        details: error.message
      });
    }
  });

  /**
   * Show database clear confirmation page
   */
  getClearDatabaseConfirm = catchAsync(async (req, res) => {
    const content = clearDatabaseTemplate({ csrfInput: req.csrfInput() });
    res.send(renderAdminPage('Confirm Database Reset', content));
  });

  /**
   * Export audit log as CSV
   */
  exportAuditLog = catchAsync(async (req, res) => {
    try {
      // Get all audit logs for export (no limit)
      const auditLogs = await AuditLog.getAuditLogs({});

      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `audit-log-export-${timestamp}.csv`;

      let csvContent = 'Date,Time,User Email,User Type,Action,Target Type,Target ID,Details,IP Address,Session ID\n';

      auditLogs.forEach(log => {
        const createdDate = formatHongKongTime(new Date(log.created_at));
        const createdTime = formatHongKongTime(new Date(log.created_at), true).split(', ')[1];
        const userEmail = (log.user_email || '').replace(/"/g, '""');
        const userType = (log.user_type || '').replace(/"/g, '""');
        const action = (log.action || '').replace(/"/g, '""');
        const targetType = (log.target_type || '').replace(/"/g, '""');
        const targetId = log.target_id || '';
        const details = (log.details || '').replace(/"/g, '""');
        const ipAddress = (log.ip_address || '').replace(/"/g, '""');
        const sessionId = (log.session_id || '').replace(/"/g, '""');

        const sanitizeCsv = (v) => {
  const s = String(v ?? '');
  const needsEscape = /^[=+\-@]/.test(s);
  const escapedQuotes = s.replace(/"/g, '""');
  return needsEscape ? `'${escapedQuotes}` : escapedQuotes;
};
csvContent += `"${sanitizeCsv(createdDate)}","${sanitizeCsv(createdTime)}","${sanitizeCsv(userEmail)}","${sanitizeCsv(userType)}","${sanitizeCsv(action)}","${sanitizeCsv(targetType)}","${sanitizeCsv(targetId)}","${sanitizeCsv(details)}","${sanitizeCsv(ipAddress)}","${sanitizeCsv(sessionId)}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Audit log export error:', error);
      res.status(500).json({
        error: 'Failed to export audit log',
        details: error.message
      });
    }
  });

  /**
   * Get audit log page
   */
  getAuditLog = catchAsync(async (req, res) => {
    const {
      user_email,
      user_type,
      action,
      target_type,
      start_date,
      end_date,
      sort_by = 'created_at',
      sort_order = 'DESC',
      page = 1,
      limit = 50
    } = req.query;

    // Validate pagination params
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));

    // Build filters
    const filters = {
      page: validatedPage,
      limit: validatedLimit
    };
    if (user_email) filters.userEmail = user_email;
    if (user_type) filters.userType = user_type;
    if (action) filters.action = action;
    if (target_type) filters.targetType = target_type;
    if (start_date) filters.startDate = start_date;
    if (end_date) filters.endDate = end_date;

    const result = await AuditLog.getAuditLogs(filters);
    const auditLogs = result.data || result; // Handle both formats for now
    const pagination = result.pagination;
    const summary = await AuditLog.getAuditSummary(filters);

    const content = auditLogTemplate({
      auditLogs,
      pagination,
      filters: { user_email, user_type, action, target_type, start_date, end_date }
    });

    res.send(renderAdminPage('Audit Log', content));
  });
}

module.exports = new AdminController();
