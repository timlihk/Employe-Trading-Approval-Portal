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
    
    const dashboardContent = `
      ${banner}
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title heading">Quick Actions</h3>
        </div>
        <div class="card-body p-6">
          <div class="grid grid-auto gap-4 grid-mobile-stack">
            <a href="/admin-requests" class="btn btn-primary text-decoration-none text-center">
              📋 Review All Requests
            </a>
            <a href="/admin-requests?escalated=true" class="btn btn-primary text-decoration-none text-center">
              ⚠️ Review Escalated Requests
            </a>
            <a href="/admin-restricted-stocks" class="btn btn-primary text-decoration-none text-center">
              🚫 Manage Restricted Stocks
            </a>
            <a href="/admin-audit-log" class="btn btn-primary text-decoration-none text-center">
              📊 View Audit Log
            </a>
            <a href="/admin-backup-list" class="btn btn-primary text-decoration-none text-center">
              💾 Backup Management
            </a>
            <a href="/admin-clear-database-confirm" class="btn btn-primary text-decoration-none text-center">
              🗑️ Clear Database
            </a>
          </div>
        </div>
      </div>
    `;

    const html = renderAdminPage('Administrator Dashboard', dashboardContent);
    res.send(html);
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
    const validatedLimit = Math.min(50, Math.max(1, parseInt(limit) || 25)); // Reduced max from 100 to 50
    
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
    
    const allRequests = result.data;
    const pagination = result.pagination;

    // Build table rows for all requests
    const tableRows = allRequests.map(request => {
      const rowClass = request.escalated ? 'class="bg-warning"' : '';
      
      let actionCell = '';
      if (request.status === 'pending') {
        actionCell = `
          <form method="post" action="/admin-approve-request" class="d-inline mr-2">\n            ${req.csrfInput()}
            <input type="hidden" name="requestId" value="${request.uuid}">
            <button type="submit" class="btn btn-success btn-sm">
              ✓ Approve
            </button>
          </form>
          <a href="/admin-reject-form/${request.uuid}" class="btn btn-danger btn-sm text-decoration-none">
            ✗ Reject
          </a>
        `;
      } else if (request.escalated) {
        actionCell = `
          <strong class="text-warning">ESCALATED</strong><br>
          <small class="text-warning">${request.escalation_reason || 'N/A'}</small>
        `;
      } else {
        // No further actions available - show dash instead of duplicating status
        actionCell = '<span class="text-muted">–</span>';
      }

      return `
        <tr ${rowClass}>
          <td class="text-center">${getDisplayId(request)}</td>
          <td class="text-center">${formatHongKongTime(new Date(request.created_at))}</td>
          <td>${request.employee_email}</td>
          <td>${request.stock_name || 'N/A'}</td>
          <td class="text-center font-weight-600">${request.ticker}</td>
          <td class="text-center">
            <span class="badge ${request.instrument_type === 'bond' ? 'badge-info' : 'badge-secondary'}">
              ${request.instrument_type === 'bond' ? 'Bond' : 'Equity'}
            </span>
          </td>
          <td class="text-center">${request.trading_type.toUpperCase()}</td>
          <td class="text-center">${parseInt(request.shares).toLocaleString()}</td>
          <td class="text-right">
            $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
          <td class="text-center">
            <span class="status-dot ${request.status === 'approved' ? 'status-dot-success' : request.status === 'rejected' ? 'status-dot-danger' : 'status-dot-warning'}"></span>
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
    const currentSortBy = req.query.sort_by || 'created_at';
    const currentSortOrder = req.query.sort_order || 'DESC';
    const sortingControls = generateSortingControls('/admin-requests', currentSortBy, currentSortOrder, req.query);

    const requestsContent = `
      ${banner}
      
      <!-- Filters Card -->
      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">Filter Trading Requests</h3>
        </div>
        <div class="card-body p-6">
          <form method="get" action="/admin-requests">
            <div class="grid grid-auto gap-4 grid-mobile-stack">
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
                <label class="form-label">Ticker/ISIN:</label>
                <input type="text" name="ticker" value="${ticker || ''}" placeholder="e.g., AAPL or US1234567890" 
                       class="form-control-sm text-uppercase">
              </div>
              <div>
                <label class="form-label">Instrument:</label>
                <select name="instrument_type" class="form-control-sm">
                  <option value="">All Instruments</option>
                  <option value="equity" ${instrument_type === 'equity' ? 'selected' : ''}>Equity (Stocks)</option>
                  <option value="bond" ${instrument_type === 'bond' ? 'selected' : ''}>Bond (ISIN)</option>
                </select>
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
            <div class="mt-6 text-center">
              <div class="btn-group btn-group-mobile">
                <button type="submit" class="btn btn-primary w-full-mobile focus-ring">Apply Filters</button>
                <a href="/admin-requests" class="btn btn-secondary text-decoration-none w-full-mobile focus-ring">Clear Filters</a>
                <a href="/admin-export-trading-requests" class="btn btn-outline text-decoration-none w-full-mobile focus-ring hover-lift">📥 Export CSV</a>
              </div>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Results Card -->
      <div class="card hover-shadow">
        <div class="card-header">
          <h3 class="card-title m-0">Trading Requests</h3>
          <p class="mt-2 m-0 text-muted text-sm">${pagination ? `${pagination.total} total, showing ${allRequests.length}` : `${allRequests.length} requests`} - Page ${pagination?.page || 1}/${pagination?.pages || 1}</p>
        </div>
        <div class="card-body p-0">
          ${allRequests.length > 0 ? `
            <div class="table-responsive">
              <table class="table table-zebra table-hover table-sticky">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Company</th>
                    <th>Ticker/ISIN</th>
                    <th>Instrument</th>
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
    const requestUuid = req.params.requestId; // Now UUID
    
    // Get the request details
    const request = await TradingRequest.getByUuid(requestUuid);
    if (!request) {
      return res.redirect('/admin-requests?error=request_not_found');
    }

    const rejectFormContent = `
      <div class="max-w-lg mx-auto">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Reject Trading Request #${getDisplayId({uuid: requestUuid})}</h3>
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
              <input type="hidden" name="requestId" value="${requestUuid}">
              <div class="mb-4">
                <label class="form-label">Rejection Reason (Optional for escalated requests):</label>
                <textarea name="rejection_reason" ${request.escalated ? '' : 'required'} rows="4" 
                         placeholder="${request.escalated ? '(Optional) Provide a reason for rejection...' : 'Please provide a detailed reason for rejection...'}" 
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

    // Build table rows
    const stockRows = restrictedStocks.map(stock => `
      <tr>
        <td class="td-center font-weight-600">${stock.ticker}</td>
        <td>${stock.company_name}</td>
        <td class="td-center">${formatHongKongTime(new Date(stock.created_at))}</td>
        <td class="td-center">
          <form method="post" action="/admin-remove-stock" class="d-inline">\n            ${req.csrfInput()}
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
          <td class="td-center">${formatHongKongTime(new Date(change.created_at), true)}</td>
          <td class="td-center font-weight-600">${change.ticker}</td>
          <td>${change.company_name}</td>
          <td class="td-center">
            <span style="color: ${actionColor};" class="font-weight-600">
              ${actionIcon} ${change.action.toUpperCase()}
            </span>
          </td>
          <td class="td-center">${change.admin_email}</td>
          <td class="td-center">${change.reason || 'N/A'}</td>
        </tr>
      `;
    }).join('');

    const restrictedContent = `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title heading">Add Restricted Stock</h3>
        </div>
        <div class="card-body p-6">
          <form method="post" action="/admin-add-stock">\n            ${req.csrfInput()}
            <div class="d-flex gap-4 align-items-center">
              <label class="form-label mb-0">Stock Ticker / Bond ISIN *</label>
              <div class="flex-grow-1">
                <input type="text" name="ticker" required placeholder="e.g., AAPL, US037833AT77" 
                       class="form-control text-uppercase">
              </div>
              <button type="submit" class="btn btn-primary">Add</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title heading text-xl">Restricted Instruments List</h3>
          <p class="mt-2 m-0 text-muted text-sm">${restrictedStocks.length} instruments restricted</p>
          ${restrictedStocks.length > 0 ? `
            <div class="mt-4">
              ${generateRestrictedStocksSortingControls('/admin-restricted-stocks', sort_by, sort_order, req.query)}
            </div>
          ` : ''}
        </div>
        <div class="card-body p-0">
          ${restrictedStocks.length > 0 ? `
            <div class="table-responsive">
              <table class="table table-zebra table-hover table-sticky">
                <thead>
                  <tr>
                    ${generateSortableHeader('ticker', 'Ticker', '/admin-restricted-stocks', sort_by, sort_order, req.query)}
                    ${generateSortableHeader('company_name', 'Company Name', '/admin-restricted-stocks', sort_by, sort_order, req.query)}
                    ${generateSortableHeader('created_at', 'Date Added', '/admin-restricted-stocks', sort_by, sort_order, req.query)}
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

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title heading text-xl">Recent Changes</h3>
          <p class="mt-2 m-0 text-muted text-sm">Last 20 modifications</p>
        </div>
        <div class="card-body p-0">
          ${changelog.length > 0 ? `
            <div class="table-responsive">
              <table class="table table-zebra table-hover table-sticky">
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

    const backupListContent = `
      <div class="container">
        ${notification}
        
        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title heading">⏰ Automatic Backup Status</h3>
          </div>
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <span class="badge ${schedulerStatus.isRunning ? 'badge-success' : 'badge-warning'} badge-sm">
                  ${schedulerStatus.isRunning ? '✅ Scheduler Active' : '⚠️ Scheduler Inactive'}
                </span>
                ${schedulerStatus.nextRun ? `
                  <div class="mt-2 text-muted">
                    Next backup: ${new Date(schedulerStatus.nextRun).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}
                  </div>
                ` : ''}
              </div>
              <a href="/admin-backup-scheduler" class="btn btn-sm btn-secondary">
                ⚙️ Configure Scheduler
              </a>
            </div>
          </div>
        </div>
        
        <div class="card mb-4">
          <div class="card-header">
            <h3 class="card-title heading">🔧 Manual Backup Options</h3>
          </div>
          <div class="card-body">
            <div class="d-flex gap-3 flex-wrap justify-center">
              <a href="/admin-backup-database" class="btn btn-primary text-decoration-none">
                📥 Download JSON Backup
              </a>
              <a href="/admin-backup-database-sql" class="btn btn-primary text-decoration-none">
                📄 Download SQL Backup
              </a>
              <form method="post" action="/admin-store-backup" class="d-inline">
                ${req.csrfInput()}
                <button type="submit" class="btn btn-success">
                  💾 Create & Store on Server
                </button>
              </form>
            </div>
            <div class="alert alert-info mt-4 mb-0">
              <strong>Format Guide:</strong>
              <ul class="mb-0 mt-2">
                <li><strong>JSON</strong>: Human-readable, easy to inspect and modify</li>
                <li><strong>SQL</strong>: Can be imported directly via psql, more portable</li>
                <li><strong>Server Storage</strong>: ${
                  process.env.RAILWAY_VOLUME_MOUNT_PATH 
                    ? `Persistent volume at ${process.env.RAILWAY_VOLUME_MOUNT_PATH}/backups ✅` 
                    : process.env.RAILWAY_ENVIRONMENT 
                      ? 'Temporary storage at /tmp/backups ⚠️ (Configure volume for persistence)' 
                      : 'Local directory'
                }</li>
                <li><strong>Automatic Backups</strong>: Run daily at 2 AM HKT by default</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3 class="card-title heading">📦 Stored Backups on Server</h3>
          </div>
          <div class="card-body">
            ${backups.length === 0 ? `
              <p class="text-center text-muted">No backups stored on server yet.</p>
              <p class="text-center text-muted">Click "Create & Store on Server" above to create your first backup.</p>
            ` : `
              <div class="table-responsive">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Created</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${backups.map(backup => `
                      <tr>
                        <td><code>${backup.filename}</code></td>
                        <td>${new Date(backup.created).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}</td>
                        <td>${Math.round(backup.size / 1024)} KB</td>
                        <td>
                          <a href="/admin-download-backup?filename=${encodeURIComponent(backup.filename)}" 
                             class="btn btn-sm btn-primary">
                            📥 Download
                          </a>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <div class="alert alert-warning mt-4">
                <strong>Storage Policy:</strong> Only the last 5 backups are kept on the server. Older backups are automatically deleted to save space.
              </div>
            `}
          </div>
        </div>

        <div class="mt-6 text-center">
          <a href="/admin-dashboard" class="btn btn-secondary text-decoration-none">
            ← Back to Dashboard
          </a>
        </div>
      </div>
    `;

    const html = renderAdminPage('Backup Management', backupListContent);
    res.send(html);
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
    
    const statusContent = `
      <div class="container">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title heading">⏰ Automatic Backup Scheduler</h3>
          </div>
          <div class="card-body">
            <div class="alert ${status.isRunning ? 'alert-success' : 'alert-warning'}">
              <strong>Status:</strong> ${status.isRunning ? '✅ Running' : '⚠️ Stopped'}
            </div>
            
            <div class="info-grid">
              <div class="info-item">
                <strong>Schedule:</strong> <code>${status.schedule}</code>
              </div>
              <div class="info-item">
                <strong>Timezone:</strong> ${status.timezone}
              </div>
              <div class="info-item">
                <strong>Next Run:</strong> ${status.nextRun ? new Date(status.nextRun).toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }) : 'N/A'}
              </div>
            </div>
            
            <div class="alert alert-info mt-4">
              <strong>Schedule Format:</strong> Cron expression (seconds minutes hours day month day-of-week)
              <ul class="mt-2 mb-0">
                <li><code>0 0 2 * * *</code> = Daily at 2:00 AM</li>
                <li><code>0 0 */6 * * *</code> = Every 6 hours</li>
                <li><code>0 0 3 * * 1</code> = Weekly on Monday at 3:00 AM</li>
              </ul>
            </div>
            
            <div class="mt-4 text-center">
              <form method="post" action="/admin-trigger-backup" class="d-inline">
                ${req.csrfInput()}
                <button type="submit" class="btn btn-primary">
                  🔄 Trigger Manual Backup Now
                </button>
              </form>
            </div>
          </div>
        </div>
        
        <div class="mt-4 text-center">
          <a href="/admin-backup-list" class="btn btn-secondary text-decoration-none">
            ← Back to Backup Management
          </a>
        </div>
      </div>
    `;
    
    const html = renderAdminPage('Backup Scheduler Status', statusContent);
    res.send(html);
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
    const { renderCard } = require('../utils/templates');
    
    const warningContent = `
      <div class="alert alert-warning mb-4">
        <h4 class="alert-heading mb-3">⚠️ WARNING: This action cannot be undone!</h4>
        <p class="mb-0">
          You are about to <strong>permanently delete ALL data</strong> from the database and reset it to brand new state.
        </p>
      </div>
      
      <div class="mb-4">
        <h5 class="text-danger mb-3">This will delete:</h5>
        <ul class="text-danger">
          <li>All trading requests (approved, rejected, pending)</li>
          <li>All restricted stocks and changelog</li>
          <li>All audit logs and activity history</li>
          <li>All employee trading history</li>
        </ul>
      </div>
      
      <div class="alert alert-danger mb-4">
        <p class="mb-0 text-center font-weight-bold">
          ⚠️ FINAL WARNING: This action is IRREVERSIBLE ⚠️
        </p>
      </div>
      
      <div class="text-center d-flex gap-3 justify-center">
        <a href="/admin-dashboard" class="btn btn-secondary text-decoration-none">
          ← Cancel (Go Back)
        </a>
        <form method="post" action="/admin-clear-database" class="d-inline">\n          ${req.csrfInput()}
          <button type="submit" class="btn btn-danger">
            🗑️ YES, PERMANENTLY DELETE ALL DATA
          </button>
        </form>
      </div>
    `;
    
    const confirmContent = renderCard(
      '⚠️ DANGER - Confirm Database Reset',
      warningContent,
      'Please read carefully before proceeding'
    );

    const html = renderAdminPage('Confirm Database Reset', `<div class="container">${confirmContent}</div>`);
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
        <td class="td-center">${formatHongKongTime(new Date(log.created_at), true)}</td>
        <td>${log.user_email}</td>
        <td class="td-center">
          <span class="badge ${log.user_type === 'admin' ? 'badge-danger' : 'badge-info'}">${log.user_type.toUpperCase()}</span>
        </td>
        <td>${log.action}</td>
        <td class="td-center">${log.target_type}</td>
        <td class="td-center">${log.target_id || 'N/A'}</td>
        <td class="max-w-200 break-word">${log.details || 'N/A'}</td>
        <td class="td-center text-monospace text-xs">${log.ip_address || 'N/A'}</td>
      </tr>
    `).join('');

    const auditContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title heading">Filter Audit Logs</h3>
        </div>
        <div class="card-body p-6">
          <form method="get" action="/admin-audit-log">
            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">User Email:</label>
                <input type="text" name="user_email" value="${user_email || ''}" 
                       placeholder="Filter by email" class="form-control-sm">
              </div>
              <div>
                <label class="form-label">User Type:</label>
                <select name="user_type" class="form-control-sm">
                  <option value="">All Types</option>
                  <option value="admin" ${user_type === 'admin' ? 'selected' : ''}>Admin</option>
                  <option value="employee" ${user_type === 'employee' ? 'selected' : ''}>Employee</option>
                </select>
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
            </div>
            <div class="mt-6 text-center">
              <div class="btn-group btn-group-mobile">
                <button type="submit" class="btn btn-primary w-full-mobile">Apply Filters</button>
                <a href="/admin-audit-log" class="btn btn-secondary text-decoration-none w-full-mobile">Clear Filters</a>
                <a href="/admin-export-audit-log" class="btn btn-outline text-decoration-none w-full-mobile hover-lift">📥 Export CSV</a>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title heading text-xl">Audit Log Results</h3>
          <p class="mt-2 m-0 text-muted text-sm">${auditLogs.length} entries found</p>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-zebra table-hover table-sticky">
              <thead>
                <tr>
                  <th class="text-center">Date & Time</th>
                  <th>User Email</th>
                  <th class="text-center">Type</th>
                  <th>Action</th>
                  <th class="text-center">Target</th>
                  <th class="text-center">Target ID</th>
                  <th>Details</th>
                  <th class="text-center">IP Address</th>
                </tr>
              </thead>
              <tbody>
                ${auditRows || '<tr><td colspan="8" class="text-center text-gray-600">No audit logs found</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card-body">
            <p class="text-muted text-sm m-0">
              Showing latest 100 entries. Use filters to narrow down results.
            </p>
          </div>
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
    'created_at': 'Date',
    'ticker': 'Ticker',
    'employee_email': 'Employee'
  };
  return displayNames[sortBy] || 'Date';
}

function generateSortableHeader(sortBy, displayName, baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  const isCurrentSort = currentSortBy === sortBy;
  const nextOrder = isCurrentSort && currentSortOrder === 'ASC' ? 'DESC' : 'ASC';
  
  const sortIcon = isCurrentSort 
    ? (currentSortOrder === 'ASC' ? ' ↑' : ' ↓')
    : '';
  
  const paramString = new URLSearchParams({
    ...cleanParams,
    sort_by: sortBy,
    sort_order: nextOrder
  }).toString();
  
  return `
    <th>
      <a href="${baseUrl}?${paramString}"
         class="th-link"
         onmouseover="this.style.color='#0066cc'" 
         onmouseout="this.style.color='inherit'">
        ${displayName}${sortIcon}
      </a>
    </th>
  `;
}

function generateRestrictedStocksSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  // Remove existing sort parameters
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  return `
    <div class="sort-controls-sm">
      <span class="text-gray-600 font-weight-600">Sort by:</span>
      <form method="get" action="${baseUrl}" class="sort-controls-sm">
        ${Object.entries(cleanParams).map(([key, value]) => 
          `<input type="hidden" name="${key}" value="${value || ''}">`
        ).join('')}
        
        <select name="sort_by" class="form-control-xs" style="border: 1px solid var(--gs-neutral-300);">
          <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
          <option value="company_name" ${currentSortBy === 'company_name' ? 'selected' : ''}>Company Name</option>
          <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date Added</option>
        </select>
        <select name="sort_order" class="form-control-xs" style="border: 1px solid var(--gs-neutral-300);">
          <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
          <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        </select>
        <button type="submit" class="btn btn-primary btn-xs">
          Apply Sort
        </button>
      </form>
    </div>
  `;
}

function generateSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  // Remove existing sort parameters
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  return `
    <form method="get" action="${baseUrl}" class="sort-controls">
      ${Object.entries(cleanParams).map(([key, value]) =>
        `<input type="hidden" name="${key}" value="${value || ''}">`
      ).join('')}

      <span class="font-weight-600 text-gray-600">Sort by:</span>
      <select name="sort_by" class="form-control-xs" style="border: 1px solid var(--gs-neutral-300);">
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
        <option value="employee_email" ${currentSortBy === 'employee_email' ? 'selected' : ''}>Employee</option>
      </select>
      <select name="sort_order" class="form-control-xs" style="border: 1px solid var(--gs-neutral-300);">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
      <button type="submit" class="btn btn-primary btn-xs">
        Apply Sort
      </button>
    </form>
  `;
}

module.exports = new AdminController();