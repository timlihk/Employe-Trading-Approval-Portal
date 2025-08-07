const AdminService = require('../services/AdminService');
const TradingRequest = require('../models/TradingRequest');
const RestrictedStock = require('../models/RestrictedStock');
const RestrictedStockChangelog = require('../models/RestrictedStockChangelog');
const database = require('../utils/database');
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
    // Get pending requests count
    const pendingRequests = await TradingRequest.getPendingRequests();
    const escalatedRequests = await TradingRequest.getEscalatedRequests();
    const totalRequests = await TradingRequest.getTotalCount();
    const restrictedStocksCount = await RestrictedStock.getCount();

    const dashboardContent = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--spacing-6); margin-bottom: var(--spacing-8);">
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <h3 style="font-size: 2.5em; margin: 0; color: var(--gs-primary);">${pendingRequests.length}</h3>
            <p style="margin: var(--spacing-2) 0 0; color: var(--gs-neutral-600);">Pending Requests</p>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <h3 style="font-size: 2.5em; margin: 0; color: var(--gs-warning);">${escalatedRequests.length}</h3>
            <p style="margin: var(--spacing-2) 0 0; color: var(--gs-neutral-600);">Escalated Requests</p>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <h3 style="font-size: 2.5em; margin: 0; color: var(--gs-info);">${totalRequests}</h3>
            <p style="margin: var(--spacing-2) 0 0; color: var(--gs-neutral-600);">Total Requests</p>
          </div>
        </div>
        <div class="card">
          <div class="card-body" style="text-align: center;">
            <h3 style="font-size: 2.5em; margin: 0; color: var(--gs-danger);">${restrictedStocksCount}</h3>
            <p style="margin: var(--spacing-2) 0 0; color: var(--gs-neutral-600);">Restricted Stocks</p>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--spacing-4);">
        <a href="/admin-requests" class="btn btn-primary" style="text-decoration: none; text-align: center; padding: var(--spacing-4);">
          📋 Review Requests
        </a>
        <a href="/admin-restricted-stocks" class="btn btn-secondary" style="text-decoration: none; text-align: center; padding: var(--spacing-4);">
          🚫 Manage Restricted Stocks
        </a>
        <a href="/admin-audit-log" class="btn btn-outline" style="text-decoration: none; text-align: center; padding: var(--spacing-4);">
          📊 View Audit Log
        </a>
        <a href="/admin-backup-database" class="btn btn-outline" style="text-decoration: none; text-align: center; padding: var(--spacing-4);">
          💾 Backup Database
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
    const { message, sort_by = 'id', sort_order = 'DESC' } = req.query;
    let banner = '';
    
    if (message === 'request_approved') {
      banner = generateNotificationBanner('Trading request approved successfully', 'success');
    } else if (message === 'request_rejected') {
      banner = generateNotificationBanner('Trading request rejected successfully', 'success');
    }

    const pendingRequests = await TradingRequest.getPendingRequests(sort_by, sort_order);
    const escalatedRequests = await TradingRequest.getEscalatedRequests(sort_by, sort_order);

    // Build table rows for pending requests
    const pendingRows = pendingRequests.map(request => `
      <tr>
        <td style="text-align: center;">${request.id}</td>
        <td style="text-align: center;">${formatHongKongTime(new Date(request.created_at))}</td>
        <td>${request.employee_email}</td>
        <td>${request.stock_name || 'N/A'}</td>
        <td style="text-align: center; font-weight: 600;">${request.ticker}</td>
        <td style="text-align: center;">${request.trading_type.toUpperCase()}</td>
        <td style="text-align: center;">${parseInt(request.shares).toLocaleString()}</td>
        <td style="text-align: center;">
          $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: center;">
          <form method="post" action="/admin-approve-request" style="display: inline; margin-right: 10px;">
            <input type="hidden" name="requestId" value="${request.id}">
            <button type="submit" class="btn btn-success" style="padding: 5px 10px; font-size: 12px;">
              ✓ Approve
            </button>
          </form>
          <button onclick="showRejectForm(${request.id})" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;">
            ✗ Reject
          </button>
        </td>
      </tr>
    `).join('');

    // Build table rows for escalated requests
    const escalatedRows = escalatedRequests.map(request => `
      <tr style="background: #fff3cd;">
        <td style="text-align: center;">${request.id}</td>
        <td style="text-align: center;">${formatHongKongTime(new Date(request.created_at))}</td>
        <td>${request.employee_email}</td>
        <td>${request.stock_name || 'N/A'}</td>
        <td style="text-align: center; font-weight: 600;">${request.ticker}</td>
        <td style="text-align: center;">${request.trading_type.toUpperCase()}</td>
        <td style="text-align: center;">${parseInt(request.shares).toLocaleString()}</td>
        <td style="text-align: center;">
          $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </td>
        <td style="text-align: center;">
          <strong style="color: #856404;">ESCALATED</strong><br>
          <small style="color: #856404;">${request.escalation_reason || 'N/A'}</small>
        </td>
      </tr>
    `).join('');

    // Generate sorting controls
    const currentSortBy = req.query.sort_by || 'id';
    const currentSortOrder = req.query.sort_order || 'DESC';
    const sortingControls = generateSortingControls('/admin-requests', currentSortBy, currentSortOrder, req.query);

    const requestsContent = `
      ${banner}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-6);">
        <div>
          ${sortingControls}
        </div>
        <div>
          <a href="/admin-export-trading-requests" class="btn btn-outline" style="text-decoration: none;">
            📥 Export All Requests (CSV)
          </a>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Pending Requests (${pendingRequests.length}) - Sorted by ${getSortDisplayName(currentSortBy)} ${currentSortOrder === 'DESC' ? '↓' : '↑'}</h3>
        </div>
        <div class="card-body">
          ${pendingRequests.length > 0 ? `
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${pendingRows}
                </tbody>
              </table>
            </div>
          ` : '<p>No pending requests</p>'}
        </div>
      </div>

      ${escalatedRequests.length > 0 ? `
        <div class="card" style="margin-top: var(--spacing-6);">
          <div class="card-header">
            <h3 class="card-title">⚠️ Escalated Requests (${escalatedRequests.length})</h3>
          </div>
          <div class="card-body">
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
                    <th>Escalation</th>
                  </tr>
                </thead>
                <tbody>
                  ${escalatedRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Reject Request Modal -->
      <div id="rejectModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 30px; border-radius: 10px; max-width: 500px; width: 90%;">
          <h3>Reject Trading Request</h3>
          <form method="post" action="/admin-reject-request">
            <input type="hidden" id="rejectRequestId" name="requestId">
            <div style="margin: 20px 0;">
              <label style="display: block; margin-bottom: 5px; font-weight: 600;">Rejection Reason:</label>
              <textarea name="rejection_reason" required style="width: 100%; height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 5px;"></textarea>
            </div>
            <div style="text-align: right; margin-top: 20px;">
              <button type="button" onclick="hideRejectForm()" class="btn btn-secondary" style="margin-right: 10px;">Cancel</button>
              <button type="submit" class="btn btn-danger">Reject Request</button>
            </div>
          </form>
        </div>
      </div>

      <script>
        function showRejectForm(requestId) {
          document.getElementById('rejectRequestId').value = requestId;
          document.getElementById('rejectModal').style.display = 'block';
        }
        
        function hideRejectForm() {
          document.getElementById('rejectModal').style.display = 'none';
        }
        
        // Close modal when clicking outside
        document.getElementById('rejectModal').addEventListener('click', function(e) {
          if (e.target === this) {
            hideRejectForm();
          }
        });
      </script>
    `;

    const html = renderAdminPage('Trading Requests', requestsContent);
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
          <form method="post" action="/admin-remove-stock" style="display: inline;" 
                onsubmit="return confirm('Are you sure you want to remove ${stock.ticker} from the restricted list?')">
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
          <form method="post" action="/admin-add-stock">
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
    
    // Get all trading requests with current sorting
    const requests = await TradingRequest.getAll(sort_by, sort_order);
    
    const timestamp = formatHongKongTime(new Date(), true).replace(/[/:,\s]/g, '-');
    const filename = `trading-requests-export-${timestamp}.csv`;

    let csvContent = 'Request ID,Date Created,Employee Email,Stock Name,Ticker,Trading Type,Shares,Estimated Value,Status,Escalated,Escalation Reason,Processed Date\n';
    
    requests.forEach(request => {
      const createdDate = formatHongKongTime(new Date(request.created_at));
      const stockName = (request.stock_name || 'N/A').replace(/"/g, '""');
      const estimatedValue = (request.total_value_usd || request.total_value || 0).toFixed(2);
      const escalated = request.escalated ? 'Yes' : 'No';
      const escalationReason = (request.escalation_reason || '').replace(/"/g, '""');
      const processedDate = request.processed_at ? formatHongKongTime(new Date(request.processed_at)) : 'N/A';
      
      csvContent += `"${request.id}","${createdDate}","${request.employee_email}","${stockName}","${request.ticker}","${request.trading_type.toUpperCase()}","${request.shares}","$${estimatedValue}","${request.status.toUpperCase()}","${escalated}","${escalationReason}","${processedDate}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  });

  /**
   * Backup database
   */
  backupDatabase = catchAsync(async (req, res) => {
    const db = database.getDb();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `trading_approval_backup_${timestamp}.sql`;

    // Get all tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

    let sqlDump = `-- Trading Approval Database Backup\n-- Generated: ${new Date().toISOString()}\n\n`;

    // Export each table
    for (const table of tables) {
      const tableName = table.name;
      
      // Get table schema
      const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(tableName);
      sqlDump += `-- Table: ${tableName}\n${schema.sql};\n\n`;
      
      // Get table data
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        sqlDump += `-- Data for table: ${tableName}\n`;
        
        for (const row of rows) {
          const values = columns.map(col => {
            const value = row[col];
            if (value === null) return 'NULL';
            if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
            return value;
          }).join(', ');
          
          sqlDump += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});\n`;
        }
        sqlDump += '\n';
      }
    }

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sqlDump);
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
  
  const queryString = new URLSearchParams(cleanParams).toString();
  const baseQuery = queryString ? `${baseUrl}?${queryString}&` : `${baseUrl}?`;

  return `
    <div style="display: flex; align-items: center; gap: var(--spacing-3);">
      <span style="font-weight: 600; color: var(--gs-neutral-700);">Sort by:</span>
      <select id="sortBy" onchange="updateSort()" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="id" ${currentSortBy === 'id' ? 'selected' : ''}>Request ID</option>
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
        <option value="employee_email" ${currentSortBy === 'employee_email' ? 'selected' : ''}>Employee</option>
      </select>
      <select id="sortOrder" onchange="updateSort()" style="padding: 6px 10px; border: 1px solid var(--gs-neutral-300); border-radius: var(--radius);">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
    </div>
    
    <script>
      function updateSort() {
        const sortBy = document.getElementById('sortBy').value;
        const sortOrder = document.getElementById('sortOrder').value;
        window.location.href = '${baseQuery}sort_by=' + sortBy + '&sort_order=' + sortOrder;
      }
    </script>
  `;
}

module.exports = new AdminController();