const AdminService = require('../services/AdminService');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const AuditLog = require('../models/AuditLog');
const database = require('../models/database');
const { catchAsync } = require('../middleware/errorHandler');
const { renderAdminPage, generateNotificationBanner } = require('../utils/templates');

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

    const result = await AdminService.addRestrictedStock(ticker, adminEmail, ipAddress);
    
    res.redirect('/admin-restricted-stocks?message=stock_added&ticker=' + encodeURIComponent(result.ticker));
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
    const requestId = parseInt(req.body.requestId || req.params.id);
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    await AdminService.approveRequest(requestId, adminEmail, ipAddress);
    
    res.redirect('/admin-requests?message=request_approved');
  });

  /**
   * Reject trading request
   */
  rejectRequest = catchAsync(async (req, res) => {
    const requestId = parseInt(req.body.requestId || req.params.id);
    const { rejection_reason } = req.body;
    const adminEmail = req.session.admin.username;
    const ipAddress = req.ip;

    await AdminService.rejectRequest(requestId, rejection_reason, adminEmail, ipAddress);
    
    res.redirect('/admin-requests?message=request_rejected');
  });

  /**
   * Get admin dashboard
   */
  getDashboard = catchAsync(async (req, res) => {
    const banner = generateNotificationBanner(req.query);
    
    const dashboardContent = `
      ${banner}
      
      <div class="grid-auto gap-4">
        <a href="/admin-requests" class="btn btn-primary text-decoration-none text-center p-4">
          📋 Review All Requests
        </a>
        <a href="/admin-requests?escalated=true" class="btn btn-warning text-decoration-none text-center p-4">
          ⚠️ Review Escalated Requests
        </a>
        <a href="/admin-restricted-stocks" class="btn btn-secondary text-decoration-none text-center p-4">
          🚫 Manage Restricted Stocks
        </a>
        <a href="/admin-audit-log" class="btn btn-outline text-decoration-none text-center p-4">
          📊 View Audit Log
        </a>
        <a href="/admin-backup-database" class="btn btn-outline text-decoration-none text-center p-4">
          💾 Backup Database
        </a>
        <a href="/admin-clear-database-confirm" class="btn btn-danger text-decoration-none text-center p-4">
          🗑️ Clear Database
        </a>
      </div>
    `;

    const html = renderAdminPage('Administrator Dashboard', dashboardContent);
    res.send(html);
  });

  /**
   * Get admin requests page
   */
  getRequests = catchAsync(async (req, res) => {
    const { message, employee_email, start_date, end_date, ticker, trading_type, status, escalated, sort_by = 'id', sort_order = 'DESC', page = 1, limit = 25 } = req.query;
    let banner = '';
    
    if (message === 'request_approved') {
      banner = generateNotificationBanner('Trading request approved successfully', 'success');
    } else if (message === 'request_rejected') {
      banner = generateNotificationBanner('Trading request rejected successfully', 'success');
    }

    // Validate pagination params
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    
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
    if (escalated === 'true') filters.escalated = true;
    if (escalated === 'false') filters.escalated = false;

    // Get requests with pagination
    const result = await TradingRequest.getFilteredHistory(filters, sort_by, sort_order);
    
    // Handle database errors gracefully
    if (!result || !result.data) {
      console.error('AdminController.getRequests: Database returned no data', { result, filters });
      throw new Error('Unable to fetch trading requests - database returned no data');
    }
    
    const allRequests = result.data;
    const pagination = result.pagination;

    // Build table rows for all requests
    const tableRows = allRequests.map(request => {
      const rowClass = request.escalated ? 'class="bg-warning"' : '';
      
      let actionCell = '';
      if (request.status === 'pending') {
        actionCell = `
          <form method="post" action="/admin-approve-request" class="d-inline mr-2">\n            ${req.csrfInput()}
            <input type="hidden" name="requestId" value="${request.id}">
            <button type="submit" class="btn btn-success btn-sm">
              ✓ Approve
            </button>
          </form>
          <a href="/admin-reject-form/${request.id}" class="btn btn-danger btn-sm text-decoration-none">
            ✗ Reject
          </a>
        `;
      } else if (request.escalated) {
        actionCell = `
          <strong class="text-warning">ESCALATED</strong><br>
          <small class="text-warning">${request.escalation_reason || 'N/A'}</small>
        `;
      } else {
        actionCell = `
          <span class="badge ${request.status === 'approved' ? 'badge-success' : request.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
            ${request.status.toUpperCase()}
          </span>
        `;
      }

      return `
        <tr ${rowClass}>
          <td class="text-center">${request.id}</td>
          <td class="text-center">${formatHongKongTime(new Date(request.created_at))}</td>
          <td>${request.employee_email}</td>
          <td>${request.stock_name || 'N/A'}</td>
          <td class="text-center font-weight-600">${request.ticker}</td>
          <td class="text-center">${request.trading_type.toUpperCase()}</td>
          <td class="text-center">${parseInt(request.shares).toLocaleString()}</td>
          <td class="text-center">
            $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
          <td class="text-center">
            <span class="badge ${request.status === 'approved' ? 'badge-success' : request.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
              ${request.status.toUpperCase()}
            </span>
          </td>
          <td class="text-center">
            ${actionCell}
          </td>
        </tr>
      `;
    }).join('');

    // Generate sorting controls
    const currentSortBy = req.query.sort_by || 'id';
    const currentSortOrder = req.query.sort_order || 'DESC';
    const sortingControls = generateSortingControls('/admin-requests', currentSortBy, currentSortOrder, req.query);

    const requestsContent = `
      ${banner}
      
      <!-- Filters Card -->
      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">Filter Trading Requests</h3>
        </div>
        <div class="card-body">
          <form method="get" action="/admin-requests">
            <div class="grid-auto gap-4">
              <div>
                <label class="form-label">Employee Email:</label>
                <input type="email" name="employee_email" value="${employee_email || ''}" placeholder="john@company.com"
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">Start Date:</label>
                <input type="date" name="start_date" value="${start_date || ''}" 
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">End Date:</label>
                <input type="date" name="end_date" value="${end_date || ''}" 
                       class="form-control-sm">
              </div>
              <div>
                <label class="form-label">Ticker:</label>
                <input type="text" name="ticker" value="${ticker || ''}" placeholder="e.g., AAPL" 
                       class="form-control-sm text-uppercase">
              </div>
              <div>
                <label class="form-label">Type:</label>
                <select name="trading_type" class="form-control-sm">
                  <option value="">All Types</option>
                  <option value="buy" ${trading_type === 'buy' ? 'selected' : ''}>Buy</option>
                  <option value="sell" ${trading_type === 'sell' ? 'selected' : ''}>Sell</option>
                </select>
              </div>
              <div>
                <label class="form-label">Status:</label>
                <select name="status" class="form-control-sm">
                  <option value="">All Statuses</option>
                  <option value="pending" ${status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="approved" ${status === 'approved' ? 'selected' : ''}>Approved</option>
                  <option value="rejected" ${status === 'rejected' ? 'selected' : ''}>Rejected</option>
                </select>
              </div>
              <div>
                <label class="form-label">Escalated:</label>
                <select name="escalated" class="form-control-sm">
                  <option value="">All</option>
                  <option value="true" ${escalated === 'true' ? 'selected' : ''}>Yes</option>
                  <option value="false" ${escalated === 'false' ? 'selected' : ''}>No</option>
                </select>
              </div>
            </div>
            <div class="mt-4 text-center">
              <button type="submit" class="btn btn-primary mr-3">Apply Filters</button>
              <a href="/admin-requests" class="btn btn-secondary text-decoration-none mr-3">Clear Filters</a>
              <a href="/admin-export-trading-requests" class="btn btn-outline text-decoration-none">📥 Export CSV</a>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Results Card -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Trading Requests (${pagination ? `${pagination.total} total, showing ${allRequests.length}` : `${allRequests.length} requests`}) - Page ${pagination?.page || 1}/${pagination?.pages || 1}</h3>
        </div>
        <div class="card-body">
          ${allRequests.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Company</th>
                    <th>Ticker</th>
                    <th>Type</th>
                    <th>Shares</th>
                    <th>Total Value (USD)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
            ${pagination && pagination.pages > 1 ? `
            <div class="mt-4 d-flex justify-center align-items-center gap-2">
              ${pagination.page > 1 ? `
                <a href="/admin-requests?${new URLSearchParams({...req.query, page: pagination.page - 1}).toString()}" 
                   class="btn btn-secondary btn-sm text-decoration-none">← Previous</a>
              ` : '<span class="btn btn-secondary btn-sm opacity-50 cursor-not-allowed">← Previous</span>'}
              
              <span class="px-3">
                Page ${pagination.page} of ${pagination.pages} (${pagination.total} total)
              </span>
              
              ${pagination.page < pagination.pages ? `
                <a href="/admin-requests?${new URLSearchParams({...req.query, page: pagination.page + 1}).toString()}" 
                   class="btn btn-secondary btn-sm text-decoration-none">Next →</a>
              ` : '<span class="btn btn-secondary btn-sm opacity-50 cursor-not-allowed">Next →</span>'}
            </div>
            ` : ''}
          ` : `
            <div class="text-center p-8 text-muted">
              <p>No trading requests found${Object.keys(filters).length > 0 ? ' matching your filters' : ''}.</p>
            </div>
          `}
        </div>
    `;

    const html = renderAdminPage('Trading Requests', requestsContent);
    res.send(html);
  });

  /**
   * Get reject form page
   */
  getRejectForm = catchAsync(async (req, res) => {
    const requestId = parseInt(req.params.requestId);
    
    // Get the request details
    const request = await TradingRequest.getById(requestId);
    if (!request) {
      return res.redirect('/admin-requests?error=request_not_found');
    }

    const rejectFormContent = `
      <div class="max-w-lg mx-auto">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Reject Trading Request #${requestId}</h3>
          </div>
          <div class="card-body">
            <div class="bg-muted p-4 rounded mb-4">
              <h4>Request Details:</h4>
              <p><strong>Employee:</strong> ${request.employee_email}</p>
              <p><strong>Stock:</strong> ${request.stock_name} (${request.ticker})</p>
              <p><strong>Action:</strong> ${request.trading_type.toUpperCase()}</p>
              <p><strong>Shares:</strong> ${parseInt(request.shares).toLocaleString()}</p>
              <p><strong>Estimated Value:</strong> $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            </div>

            <form method="post" action="/admin-reject-request">\n            ${req.csrfInput()}
              <input type="hidden" name="requestId" value="${requestId}">
              <div class="mb-4">
                <label class="form-label">Rejection Reason:</label>
                <textarea name="rejection_reason" required rows="4" 
                         placeholder="Please provide a detailed reason for rejection..." 
                         class="form-control resize-vertical"></textarea>
              </div>
              <div class="text-center d-flex gap-3 justify-center">
                <a href="/admin-requests" class="btn btn-secondary text-decoration-none p-3">
                  Cancel
                </a>
                <button type="submit" class="btn btn-danger p-3">
                  Reject Request
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    const html = renderAdminPage('Reject Trading Request', rejectFormContent);
    res.send(html);
  });

  /**
   * Get restricted stocks page
   */
  getRestrictedStocks = catchAsync(async (req, res) => {
    const { message, ticker, error } = req.query;
    let banner = '';
    
    if (message === 'stock_added' && ticker) {
      banner = generateNotificationBanner(`${ticker} has been successfully added to the restricted stocks list`, 'success');
    } else if (message === 'stock_removed' && ticker) {
      banner = generateNotificationBanner(`${ticker} has been successfully removed from the restricted stocks list`, 'success');
    } else if (error === 'already_exists' && ticker) {
      banner = generateNotificationBanner(`${ticker} is already in the restricted stocks list`, 'error');
    } else if (error === 'not_found' && ticker) {
      banner = generateNotificationBanner(`${ticker} is not in the restricted stocks list`, 'error');
    }

    const restrictedStocks = await RestrictedStock.findAll();
    const changelog = await RestrictedStockChangelog.getRecentChanges(20);

    // Build table rows
    const stockRows = restrictedStocks.map(stock => `
      <tr>
        <td style="text-align: center; font-weight: 600;">${stock.ticker}</td>
        <td>${stock.company_name}</td>
        <td style="text-align: center;">${formatHongKongTime(new Date(stock.created_at))}</td>
        <td style="text-align: center;">
          <form method="post" action="/admin-remove-stock" style="display: inline;">\n            ${req.csrfInput()}
            <input type="hidden" name="ticker" value="${stock.ticker}">
            <button type="submit" class="btn btn-danger btn-sm">Remove</button>
          </form>
        </td>
      </tr>
    `).join('');

    // Build changelog rows
    const changelogRows = changelog.map(change => {
      const actionColor = change.action === 'added' ? '#28a745' : '#dc3545';
      const actionIcon = change.action === 'added' ? '+' : '−';
      
      return `
        <tr>
          <td style="text-align: center;">${formatHongKongTime(new Date(change.created_at), true)}</td>
          <td style="text-align: center; font-weight: 600;">${change.ticker}</td>
          <td>${change.company_name}</td>
          <td style="text-align: center;">
            <span style="color: ${actionColor}; font-weight: 600;">
              ${actionIcon} ${change.action.toUpperCase()}
            </span>
          </td>
          <td style="text-align: center;">${change.admin_email}</td>
          <td style="text-align: center;">${change.reason || 'N/A'}</td>
        </tr>
      `;
    }).join('');

    const restrictedContent = `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Add Restricted Stock</h3>
        </div>
        <div class="card-body">
          <form method="post" action="/admin-add-stock">\n            ${req.csrfInput()}
            <div style="display: flex; gap: var(--spacing-3); align-items: end;">
              <div style="flex: 1;">
                <label style="display: block; margin-bottom: var(--spacing-2); font-weight: 600;">Stock Ticker:</label>
                <input type="text" name="ticker" required placeholder="e.g., AAPL" 
                       style="width: 100%; padding: var(--spacing-3); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius); text-transform: uppercase;">
              </div>
              <button type="submit" class="btn btn-primary">Add Stock</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card" style="margin-top: var(--spacing-6);">
        <div class="card-header">
          <h3 class="card-title">Current Restricted Stocks (${restrictedStocks.length})</h3>
        </div>
        <div class="card-body">
          ${restrictedStocks.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Company Name</th>
                    <th>Date Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${stockRows}
                </tbody>
              </table>
            </div>
          ` : '<p>No restricted stocks configured</p>'}
        </div>
      </div>

      <div class="card" style="margin-top: var(--spacing-6);">
        <div class="card-header">
          <h3 class="card-title">Recent Changes</h3>
        </div>
        <div class="card-body">
          ${changelog.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Action</th>
                    <th>Admin</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  ${changelogRows}
                </tbody>
              </table>
            </div>
          ` : '<p>No recent changes</p>'}
        </div>
      </div>
    `;

    const html = renderAdminPage('Restricted Stocks', restrictedContent);
    res.send(html);
  });

  /**
   * Export trading requests as CSV
   */
  exportTradingRequests = catchAsync(async (req, res) => {
    const { sort_by = 'id', sort_order = 'DESC' } = req.query;
    
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
csvContent += `"${sanitizeCsv(request.id)}","${sanitizeCsv(createdDate)}","${sanitizeCsv(request.employee_email)}","${sanitizeCsv(stockName)}","${sanitizeCsv(request.ticker)}","${sanitizeCsv(request.trading_type.toUpperCase())}","${sanitizeCsv(request.shares)}","${sanitizeCsv(estimatedValue)}","${sanitizeCsv(request.status.toUpperCase())}","${sanitizeCsv(escalated)}","${sanitizeCsv(escalationReason)}","${sanitizeCsv(processedDate)}"\n`;
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
   * Backup database as CSV files in ZIP
   */
  backupDatabase = catchAsync(async (req, res) => {
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      // For PostgreSQL, we'll export all data as CSV files
      const backupData = {
        metadata: {
          backup_date: new Date().toISOString(),
          database_type: 'PostgreSQL',
          version: '1.0'
        }
      };

      // Get all trading requests
      const requests = await TradingRequest.getAll();
      backupData.trading_requests = requests;

      // Get all restricted stocks  
      const restrictedStocks = await RestrictedStock.getAll();
      backupData.restricted_stocks = restrictedStocks;

      // Get audit logs (recent 1000 entries)
      const auditLogs = await AuditLog.getAuditLogs({ limit: 1000 });
      backupData.audit_logs = auditLogs;

      // Get restricted stock changelog
      const changelog = await RestrictedStockChangelog.getAll();
      backupData.restricted_stock_changelog = changelog;

      // Generate JSON backup file
      const jsonContent = JSON.stringify(backupData, null, 2);
      const filename = `trading_approval_backup_${timestamp}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(jsonContent);

    } catch (error) {
      console.error('Database backup error:', error);
      res.status(500).json({
        error: 'Failed to create database backup',
        details: error.message
      });
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
    const confirmContent = `
      <div style="max-width: 600px; margin: 0 auto;">
        <div class="card" style="border: 2px solid #dc3545;">
          <div class="card-header" style="background: #dc3545; color: white;">
            <h3 class="card-title" style="color: white; margin: 0;">⚠️ DANGER - Confirm Database Reset</h3>
          </div>
          <div class="card-body" style="background: #f8f9fa;">
            <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: var(--spacing-4); border-radius: var(--radius); margin-bottom: var(--spacing-4);">
              <h4 style="color: #856404; margin: 0 0 var(--spacing-3) 0;">⚠️ WARNING: This action cannot be undone!</h4>
              <p style="color: #856404; margin: 0; line-height: 1.6;">
                You are about to <strong>permanently delete ALL data</strong> from the database and reset it to brand new state.
              </p>
            </div>
            
            <div style="margin: var(--spacing-4) 0;">
              <h5 style="color: #dc3545; margin-bottom: var(--spacing-3);">This will delete:</h5>
              <ul style="color: #dc3545; margin: 0; padding-left: var(--spacing-5);">
                <li>All trading requests (approved, rejected, pending)</li>
                <li>All restricted stocks and changelog</li>
                <li>All audit logs and activity history</li>
                <li>All employee trading history</li>
              </ul>
            </div>
            
            <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: var(--spacing-4); border-radius: var(--radius); margin: var(--spacing-4) 0;">
              <p style="color: #721c24; margin: 0; font-weight: 600; text-align: center;">
                ⚠️ FINAL WARNING: This action is IRREVERSIBLE ⚠️
              </p>
            </div>
            
            <div style="display: flex; gap: var(--spacing-4); justify-content: center; margin-top: var(--spacing-6);">
              <a href="/admin-dashboard" class="btn btn-secondary" style="text-decoration: none; padding: var(--spacing-3) var(--spacing-6);">
                ← Cancel (Go Back)
              </a>
              <form method="post" action="/admin-clear-database" style="display: inline;">\n                ${req.csrfInput()}
                <button type="submit" class="btn btn-danger" style="padding: var(--spacing-3) var(--spacing-6);">
                  🗑️ YES, PERMANENTLY DELETE ALL DATA
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    const html = renderAdminPage('Confirm Database Reset', confirmContent);
    res.send(html);
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

    // Generate sorting controls
    const sortingControls = generateSortingControls('/admin-audit-log', sort_by, sort_order, {
      user_email, user_type, action, target_type, start_date, end_date
    });

    // Build audit log rows
    const auditRows = auditLogs.map(log => `
      <tr>
        <td style="text-align: center;">${formatHongKongTime(new Date(log.created_at), true)}</td>
        <td>${log.user_email}</td>
        <td style="text-align: center;">
          <span class="badge ${log.user_type === 'admin' ? 'badge-danger' : 'badge-info'}">${log.user_type.toUpperCase()}</span>
        </td>
        <td>${log.action}</td>
        <td style="text-align: center;">${log.target_type}</td>
        <td style="text-align: center;">${log.target_id || 'N/A'}</td>
        <td style="max-width: 200px; word-break: break-word;">${log.details || 'N/A'}</td>
        <td style="text-align: center; font-family: monospace; font-size: 12px;">${log.ip_address || 'N/A'}</td>
      </tr>
    `).join('');

    const auditContent = `
      <div class="card">
        <div class="card-header">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <h3 class="card-title">🔍 Audit Log</h3>
            ${sortingControls}
          </div>
        </div>
        <div class="card-body">
          <!-- Filter Form -->
          <form method="get" action="/admin-audit-log" style="margin-bottom: var(--spacing-4); padding: var(--spacing-4); background: var(--gs-neutral-100); border-radius: var(--radius);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-3);">
              <div>
                <label style="display: block; margin-bottom: var(--spacing-1); font-weight: 600;">User Email:</label>
                <input type="text" name="user_email" value="${user_email || ''}" 
                       placeholder="Filter by email" style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-1); font-weight: 600;">User Type:</label>
                <select name="user_type" style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
                  <option value="">All Types</option>
                  <option value="admin" ${user_type === 'admin' ? 'selected' : ''}>Admin</option>
                  <option value="employee" ${user_type === 'employee' ? 'selected' : ''}>Employee</option>
                </select>
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-1); font-weight: 600;">Start Date:</label>
                <input type="date" name="start_date" value="${start_date || ''}" 
                       style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
              </div>
              <div>
                <label style="display: block; margin-bottom: var(--spacing-1); font-weight: 600;">End Date:</label>
                <input type="date" name="end_date" value="${end_date || ''}" 
                       style="width: 100%; padding: var(--spacing-2); border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
              </div>
              <div style="display: flex; align-items: end; gap: var(--spacing-2);">
                <button type="submit" class="btn btn-primary">Filter</button>
                <a href="/admin-audit-log" class="btn btn-secondary">Clear</a>
                <a href="/admin-export-audit-log" class="btn btn-outline">📥 Export CSV</a>
              </div>
            </div>
          </form>

          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th style="text-align: center;">Date & Time</th>
                  <th>User Email</th>
                  <th style="text-align: center;">Type</th>
                  <th>Action</th>
                  <th style="text-align: center;">Target</th>
                  <th style="text-align: center;">Target ID</th>
                  <th>Details</th>
                  <th style="text-align: center;">IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${auditRows || '<tr><td colspan="8" style="text-align: center; color: var(--gs-neutral-600);">No audit logs found</td></tr>'}
              </tbody>
            </table>
          </div>

          <p style="color: var(--gs-neutral-600); font-size: var(--font-size-sm); margin-top: var(--spacing-4);">
            Showing latest 100 entries. Use filters to narrow down results.
          </p>
        </div>
      </div>

    `;

    const html = renderAdminPage('Audit Log', auditContent);
    res.send(html);
  });
}

// Helper functions
function formatHongKongTime(date = new Date(), includeTime = false) {
  let utcDate;
  
  if (typeof date === 'string') {
    utcDate = new Date(date + 'Z');
  } else {
    utcDate = date;
  }
  
  const hkTime = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
  
  if (includeTime) {
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    const hour = hkTime.getUTCHours().toString().padStart(2, '0');
    const minute = hkTime.getUTCMinutes().toString().padStart(2, '0');
    const second = hkTime.getUTCSeconds().toString().padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
  } else {
    const day = hkTime.getUTCDate().toString().padStart(2, '0');
    const month = (hkTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = hkTime.getUTCFullYear();
    
    return `${day}/${month}/${year}`;
  }
}

function getSortDisplayName(sortBy) {
  const displayNames = {
    'id': 'Request ID',
    'created_at': 'Date',
    'ticker': 'Ticker',
    'employee_email': 'Employee'
  };
  return displayNames[sortBy] || 'Request ID';
}

function generateSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  // Remove existing sort parameters
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  return `
    <form method="get" action="${baseUrl}" style="display: flex; align-items: center; gap: var(--spacing-3); flex-wrap: wrap;">
      ${Object.entries(cleanParams).map(([key, value]) => 
        `<input type="hidden" name="${key}" value="${value || ''}">`
      ).join('')}
      
      <span style="font-weight: 600; color: var(--gs-neutral-700);">Sort by:</span>
      <select name="sort_by" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="id" ${currentSortBy === 'id' ? 'selected' : ''}>Request ID</option>
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
        <option value="employee_email" ${currentSortBy === 'employee_email' ? 'selected' : ''}>Employee</option>
      </select>
      <select name="sort_order" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm" style="padding: 6px 15px; font-size: var(--font-size-sm);">
        Apply Sort
      </button>
    </form>
  `;
}

module.exports = new AdminController();