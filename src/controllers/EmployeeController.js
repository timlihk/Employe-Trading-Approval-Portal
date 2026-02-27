const TradingRequestService = require('../services/TradingRequestService');
const StatementRequestService = require('../services/StatementRequestService');
const StatementRequest = require('../models/StatementRequest');
const BrokerageAccount = require('../models/BrokerageAccount');
const EmployeeProfile = require('../models/EmployeeProfile');
const { catchAsync } = require('../middleware/errorHandler');
const { renderEmployeePage, generateNotificationBanner } = require('../utils/templates');
const { getDisplayId } = require('../utils/formatters');

class EmployeeController {
  /**
   * Get employee dashboard
   */
  getDashboard = catchAsync(async (req, res) => {
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const { error, message, ticker, shares, trading_type } = req.query;
    let banner = '';
    
    if (error) {
      banner = generateNotificationBanner({ error: error });
    } else if (message === 'login_success') {
      banner = generateNotificationBanner({ message: 'Welcome! You have been successfully logged in.' });
    }

    // Pre-fill form if provided in query params
    const prefilledTicker = ticker ? decodeURIComponent(ticker) : '';
    const prefilledShares = shares ? decodeURIComponent(shares) : '';
    const prefilledType = trading_type ? decodeURIComponent(trading_type) : 'buy';

    // Fetch brokerage accounts and statement requests for this employee
    const employeeEmail = req.session.employee.email;
    let brokerageAccounts = [];
    let statementRequests = [];
    try {
      brokerageAccounts = await BrokerageAccount.getByEmployee(employeeEmail);
      statementRequests = await StatementRequest.getByEmployee(employeeEmail);
    } catch (err) {
      // Non-critical — dashboard still works without these
    }

    const pendingStatements = statementRequests.filter(r => r.status === 'pending' || r.status === 'overdue');
    const uploadedStatements = statementRequests.filter(r => r.status === 'uploaded').slice(0, 8);

    // Build pending statement rows
    const pendingRows = pendingStatements.map(r => {
      const monthName = new Date(r.period_year, r.period_month - 1).toLocaleString('en-US', { month: 'long' });
      const deadlineStr = r.deadline_at
        ? new Date(r.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'N/A';
      const isOverdue = r.status === 'overdue' || (r.deadline_at && new Date(r.deadline_at) < new Date());
      return `<tr>
        <td><span class="font-weight-600">${monthName} ${r.period_year}</span></td>
        <td class="text-sm">${r.brokerage_name || '-'}</td>
        <td>${deadlineStr}${isOverdue ? ' <span class="table-status overdue">Overdue</span>' : ''}</td>
        <td><a href="${r.upload_token ? '/upload-statement/' + r.upload_token : '/employee-upload-statement'}" class="btn btn-sm btn-primary">Upload</a></td>
      </tr>`;
    }).join('');

    // Build uploaded statement rows
    const uploadedRows = uploadedStatements.map(r => {
      const monthName = new Date(r.period_year, r.period_month - 1).toLocaleString('en-US', { month: 'long' });
      const uploadedDate = r.uploaded_at
        ? new Date(r.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-';
      const fileInfo = r.original_filename || '-';
      const fileLink = r.sharepoint_item_id
        ? `<a href="/statement-file/${r.uuid}" target="_blank" rel="noopener">${fileInfo}</a>`
        : fileInfo;
      return `<tr>
        <td><span class="font-weight-600">${monthName} ${r.period_year}</span></td>
        <td class="text-sm">${r.brokerage_name || '-'}</td>
        <td class="text-sm">${fileLink}</td>
        <td class="table-date">${uploadedDate}</td>
        <td><span class="table-status uploaded">Uploaded</span></td>
      </tr>`;
    }).join('');

    // Build brokerage accounts list
    const accountRows = brokerageAccounts.map(a =>
      `<tr>
        <td class="font-weight-600">${a.firm_name}</td>
        <td class="text-sm">${a.account_number}</td>
        <td><a href="/employee-upload-statement?account=${a.uuid}" class="btn btn-sm btn-primary">Upload</a></td>
      </tr>`
    ).join('');

    // Statement card content
    let statementCardContent = '';

    // Brokerage accounts section
    if (brokerageAccounts.length > 0) {
      statementCardContent += `
        <h4 class="mb-3">Your Brokerage Accounts</h4>
        <div class="table-container">
          <table class="modern-table">
            <thead><tr><th>Firm</th><th>Account #</th><th>Action</th></tr></thead>
            <tbody>${accountRows}</tbody>
          </table>
        </div>`;
    } else {
      statementCardContent += `
        <p class="text-muted mb-3">No brokerage accounts registered. Please add your accounts to start uploading statements.</p>`;
    }

    // Pending uploads from admin emails
    if (pendingStatements.length > 0) {
      statementCardContent += `
        <hr class="my-4">
        <h4 class="mb-3">Pending Requests</h4>
        <div class="table-container">
          <table class="modern-table">
            <thead><tr><th>Period</th><th>Brokerage</th><th>Deadline</th><th>Action</th></tr></thead>
            <tbody>${pendingRows}</tbody>
          </table>
        </div>`;
    }

    // Recent uploads (collapsible)
    if (uploadedStatements.length > 0) {
      statementCardContent += `
        <hr class="my-4">
        <div class="collapsible-help">
          <input type="checkbox" id="recent-uploads-toggle" class="help-checkbox">
          <label for="recent-uploads-toggle" class="help-toggle section-toggle">
            <span class="toggle-text-show">Recent Uploads (${uploadedStatements.length})</span>
            <span class="toggle-text-hide">Recent Uploads (${uploadedStatements.length})</span>
          </label>
          <div class="help-content">
            <div class="table-container">
              <table class="modern-table">
                <thead><tr><th>Period</th><th>Brokerage</th><th>File</th><th>Uploaded</th><th>Status</th></tr></thead>
                <tbody>${uploadedRows}</tbody>
              </table>
            </div>
          </div>
        </div>`;
    }

    const statementCard = `
      <div class="card mt-6">
        <div class="card-header">
          <h3 class="card-title">Monthly Trading Statements</h3>
        </div>
        <div class="card-body">
          <div class="mb-4">
            <a href="/employee-brokerage-accounts" class="btn btn-secondary">Manage Accounts</a>
          </div>
          ${statementCardContent}
        </div>
      </div>`;

    const dashboardContent = `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Submit Trading Request</h3>
        </div>
        <div class="card-body p-6">
          <form method="post" action="/preview-trade" id="tradingForm">
            ${req.csrfInput()}
            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">Stock Ticker or Bond ISIN</label>
                <input type="text" name="ticker" value="${prefilledTicker}" required
                       placeholder="e.g., AAPL, MSFT or US1234567890"
                       class="form-control text-uppercase"
                       maxlength="20" pattern="[A-Za-z0-9.-]+">
                <div class="collapsible-help">
                  <input type="checkbox" id="ticker-help-toggle" class="help-checkbox">
                  <label for="ticker-help-toggle" class="help-toggle">
                    <span class="toggle-text-show">Show examples</span>
                    <span class="toggle-text-hide">Hide examples</span>
                  </label>
                  <div class="help-content">
                    <strong>US Stocks:</strong> AAPL, MSFT, GOOGL, TSLA, NVDA, AMZN<br>
                    <strong>Bond ISINs:</strong> US1234567890, GB0987654321, DE0123456789<br>
                    <strong>Hong Kong:</strong> 0700.HK, 9988.HK, 2318.HK<br>
                    <strong>UK:</strong> BARC.L, LLOY.L, VOD.L<br>
                    <strong>Europe:</strong> ASML.AS, SAP.DE, NESN.SW
                  </div>
                </div>
              </div>

              <div>
                <label class="form-label">Number of Shares/Units</label>
                <input type="number" name="shares" value="${prefilledShares}" required min="1" max="1000000"
                       class="form-control">
                <div class="collapsible-help">
                  <input type="checkbox" id="shares-help-toggle" class="help-checkbox">
                  <label for="shares-help-toggle" class="help-toggle">
                    <span class="toggle-text-show">Show details</span>
                    <span class="toggle-text-hide">Hide details</span>
                  </label>
                  <div class="help-content">
                    <strong>For Stocks:</strong> Enter the number of shares (1 - 1,000,000)<br>
                    <strong>For Bonds:</strong> Enter the face value in USD (e.g., 10000 for $10,000 face value). The system assumes USD currency for bonds.
                  </div>
                </div>
              </div>

              <div>
                <label class="form-label">Trading Type</label>
                <div class="d-flex gap-6">
                  <label class="radio-option">
                    <input type="radio" name="trading_type" value="buy" ${prefilledType === 'buy' ? 'checked' : ''}>
                    <span class="text-success font-weight-600">BUY</span>
                  </label>
                  <label class="radio-option ml-4">
                    <input type="radio" name="trading_type" value="sell" ${prefilledType === 'sell' ? 'checked' : ''}>
                    <span class="text-danger font-weight-600">SELL</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="mt-6 text-center">
              <button type="submit" class="btn btn-primary w-full-mobile">
                Preview Trading Request
              </button>
            </div>
          </form>
        </div>
      </div>
      ${statementCard}
    `;

    const html = renderEmployeePage('Employee Dashboard', dashboardContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * GET /employee-brokerage-accounts
   * Manage brokerage accounts (add, edit, remove).
   */
  getBrokerageAccounts = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const banner = generateNotificationBanner(req.query);
    const email = req.session.employee.email;
    const accounts = await BrokerageAccount.getByEmployee(email);

    // Detect onboarding / confirmation mode
    const isConfirmed = await EmployeeProfile.isConfirmationCurrent(email);
    const isSetupMode = accounts.length === 0;
    const isConfirmMode = accounts.length > 0 && !isConfirmed;

    // Contextual banner for setup or confirmation
    let contextBanner = '';
    if (isSetupMode) {
      contextBanner = `
        <div class="alert-warning alert" role="alert">
          <strong>Welcome! Before you can submit trading requests or upload statements, you must register at least one brokerage account below.</strong>
        </div>`;
    } else if (isConfirmMode) {
      contextBanner = `
        <div class="alert-info alert" role="alert">
          <strong>Please review your brokerage accounts below and confirm they are complete and up to date.</strong>
        </div>`;
    }

    // Editing an account?
    const editUuid = req.query.edit;
    const editAccount = editUuid ? accounts.find(a => a.uuid === editUuid) : null;

    const accountRows = accounts.map(a => `
      <tr>
        <td class="font-weight-600">${a.firm_name}</td>
        <td>${a.account_number}</td>
        <td>
          <a href="/employee-brokerage-accounts?edit=${a.uuid}" class="btn btn-sm btn-secondary">Edit</a>
          <form method="post" action="/employee-remove-brokerage" class="d-inline">
            ${req.csrfInput()}
            <input type="hidden" name="uuid" value="${a.uuid}">
            <button type="submit" class="btn btn-sm btn-danger">Remove</button>
          </form>
        </td>
      </tr>
    `).join('');

    // Confirmation section — shown when accounts exist but not confirmed
    const confirmationSection = isConfirmMode ? `
      <div class="card mt-6">
        <div class="card-body p-6 text-center">
          <p class="mb-4">I confirm that the brokerage accounts listed above are complete and up to date.</p>
          <form method="post" action="/employee-confirm-accounts">
            ${req.csrfInput()}
            <button type="submit" class="btn btn-primary">Confirm Accounts Are Up to Date</button>
          </form>
        </div>
      </div>
    ` : '';

    // Only show back link when setup and confirmation are both done
    const backLink = (!isSetupMode && !isConfirmMode) ? `
      <div class="mt-4">
        <a href="/employee-dashboard" class="btn btn-secondary">Back to Dashboard</a>
      </div>
    ` : '';

    const content = `
      ${banner}
      ${contextBanner}
      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">${editAccount ? 'Edit Brokerage Account' : 'Add Brokerage Account'}</h3>
        </div>
        <div class="card-body p-6">
          <form method="post" action="${editAccount ? '/employee-edit-brokerage' : '/employee-add-brokerage'}">
            ${req.csrfInput()}
            ${editAccount ? `<input type="hidden" name="uuid" value="${editAccount.uuid}">` : ''}
            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">Firm Name</label>
                <input type="text" name="firm_name" required placeholder="e.g., Interactive Brokers"
                       value="${editAccount ? editAccount.firm_name : ''}"
                       class="form-control" maxlength="255">
              </div>
              <div>
                <label class="form-label">Account Number</label>
                <input type="text" name="account_number" required placeholder="e.g., U12345678"
                       value="${editAccount ? editAccount.account_number : ''}"
                       class="form-control" maxlength="100">
              </div>
            </div>
            <div class="mt-4">
              <button type="submit" class="btn btn-primary">${editAccount ? 'Save Changes' : 'Add Account'}</button>
              ${editAccount ? '<a href="/employee-brokerage-accounts" class="btn btn-secondary ml-2">Cancel</a>' : ''}
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Your Brokerage Accounts</h3>
        </div>
        <div class="card-body ${accounts.length === 0 ? '' : 'p-0'}">
          ${accounts.length > 0 ? `
            <div class="table-container">
              <table class="modern-table">
                <thead><tr><th>Firm</th><th>Account Number</th><th>Actions</th></tr></thead>
                <tbody>${accountRows}</tbody>
              </table>
            </div>
          ` : '<p class="text-muted text-center p-6">No brokerage accounts registered yet. Add one above to start uploading statements.</p>'}
        </div>
      </div>

      ${confirmationSection}
      ${backLink}
    `;

    res.send(renderEmployeePage('Brokerage Accounts', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * POST /employee-add-brokerage
   */
  addBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { firm_name, account_number } = req.body;
    if (!firm_name || !account_number) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Firm name and account number are required'));
    }
    const result = await BrokerageAccount.create({
      employee_email: req.session.employee.email,
      firm_name,
      account_number
    });
    if (!result) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('This account already exists'));
    }
    delete req.session._brokerageCheck;
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Brokerage account added'));
  });

  /**
   * POST /employee-edit-brokerage
   */
  editBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { uuid, firm_name, account_number } = req.body;
    if (!uuid || !firm_name || !account_number) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('All fields are required'));
    }
    await BrokerageAccount.update(uuid, req.session.employee.email, { firm_name, account_number });
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Account updated'));
  });

  /**
   * POST /employee-remove-brokerage
   */
  removeBrokerage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    const { uuid } = req.body;
    await BrokerageAccount.delete(uuid, req.session.employee.email);
    delete req.session._brokerageCheck;
    res.redirect('/employee-brokerage-accounts?message=' + encodeURIComponent('Account removed'));
  });

  /**
   * POST /employee-confirm-accounts
   * Confirm brokerage accounts are up to date (monthly confirmation).
   */
  confirmAccounts = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const email = req.session.employee.email;

    // Must have at least one account to confirm
    const accounts = await BrokerageAccount.getByEmployee(email);
    if (!accounts || accounts.length === 0) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Please add at least one brokerage account before confirming'));
    }

    await EmployeeProfile.confirmAccounts(email);
    delete req.session._brokerageCheck;
    res.redirect('/employee-dashboard?message=accounts_confirmed');
  });

  /**
   * GET /employee-upload-statement
   * Upload form — pre-selects account if ?account=uuid is provided.
   */
  getUploadStatementPage = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const banner = generateNotificationBanner(req.query);
    const employeeEmail = req.session.employee.email;
    const accounts = await BrokerageAccount.getByEmployee(employeeEmail);

    if (accounts.length === 0) {
      return res.redirect('/employee-brokerage-accounts?error=' + encodeURIComponent('Please add a brokerage account before uploading statements'));
    }

    const selectedAccountUuid = req.query.account || '';

    // Build month/year options (last 12 months)
    const now = new Date();
    const periodOptions = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mName = d.toLocaleString('en-US', { month: 'long' });
      periodOptions.push(`<option value="${y}-${m}">${mName} ${y}</option>`);
    }

    // Build account options
    const accountOptions = accounts.map(a => {
      const selected = a.uuid === selectedAccountUuid ? 'selected' : '';
      return `<option value="${a.uuid}" ${selected}>${a.firm_name} — ${a.account_number}</option>`;
    }).join('');

    const content = `
      ${banner}
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Upload Trading Statement</h3>
        </div>
        <div class="card-body p-6">
          <form method="post" action="/employee-upload-statement" enctype="multipart/form-data">
            ${req.csrfInput()}

            <div class="grid grid-auto gap-4 grid-mobile-stack">
              <div>
                <label class="form-label">Brokerage Account</label>
                <select name="account_uuid" required class="form-control">
                  <option value="">Select account...</option>
                  ${accountOptions}
                </select>
              </div>

              <div>
                <label class="form-label">Statement Period</label>
                <select name="period" required class="form-control">
                  <option value="">Select month...</option>
                  ${periodOptions.join('')}
                </select>
              </div>
            </div>

            <div class="mt-4">
              <label class="form-label">Statement File</label>
              <div class="file-input-wrapper">
                <input type="file" name="statement" required
                       accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx">
                <span class="file-input-icon">&#128196;</span>
                <span class="file-input-text">Click to select a file</span>
                <span class="file-input-hint">PDF, PNG, JPG, CSV, XLSX — max 10 MB</span>
                <span class="file-input-selected">
                  <span class="file-input-selected-icon">&#10003;</span>
                  File selected — click to change
                </span>
              </div>
            </div>

            <div class="mt-4">
              <label class="form-label">Notes (optional)</label>
              <textarea name="notes" rows="3"
                        placeholder="Any additional notes about this statement..."
                        class="form-control resize-vertical"></textarea>
            </div>

            <div class="mt-6 text-center">
              <button type="submit" class="btn btn-primary w-full-mobile">
                Upload Statement
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="mt-4">
        <a href="/employee-dashboard" class="btn btn-secondary">Back to Dashboard</a>
      </div>
    `;

    res.send(renderEmployeePage('Upload Statement', content, req.session.employee.name, req.session.employee.email));
  });

  /**
   * POST /employee-upload-statement
   * Process the self-service statement upload.
   */
  processStatementUpload = catchAsync(async (req, res) => {
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const file = req.file;
    const { period, account_uuid, notes } = req.body;

    if (!file) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a file to upload'));
    }
    if (!period) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a statement period'));
    }
    if (!account_uuid) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Please select a brokerage account'));
    }

    // Parse period "YYYY-M"
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    if (!year || !month || month < 1 || month > 12) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Invalid period selected'));
    }

    // Look up the brokerage account
    const account = await BrokerageAccount.findByUuid(account_uuid);
    if (!account || account.employee_email !== req.session.employee.email.toLowerCase()) {
      return res.redirect('/employee-upload-statement?error=' + encodeURIComponent('Invalid brokerage account'));
    }

    const brokerageName = `${account.firm_name} — ${account.account_number}`;
    const employee = {
      email: req.session.employee.email,
      name: req.session.employee.name
    };

    try {
      await StatementRequestService.processEmployeeUpload(
        employee,
        file,
        { year, month },
        brokerageName,
        notes
      );

      res.redirect('/employee-dashboard?message=' + encodeURIComponent('Statement uploaded successfully'));
    } catch (error) {
      res.redirect('/employee-upload-statement?account=' + account_uuid + '&error=' + encodeURIComponent(error.message));
    }
  });

  /**
   * Get employee history
   */
  getHistory = catchAsync(async (req, res) => {
    const { message, error, start_date, end_date, ticker, trading_type, status, instrument_type, sort_by = 'created_at', sort_order = 'DESC', page = 1, limit = 25 } = req.query;
    
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const employeeEmail = req.session.employee.email;
    
    let banner = '';
    if (message === 'escalation_submitted') {
      banner = generateNotificationBanner({ message: 'Your escalation has been submitted successfully and will be reviewed by administrators.' });
    } else if (error) {
      banner = generateNotificationBanner({ error: error });
    }

    // Validate pagination params
    const validatedPage = Math.max(1, parseInt(page) || 1);
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 25));
    
    // Build filters
    const filters = {
      page: validatedPage,
      limit: validatedLimit
    };
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;
    if (ticker) filters.ticker = ticker.toUpperCase();
    if (trading_type) filters.trading_type = trading_type;
    if (status) filters.status = status;
    if (instrument_type) filters.instrument_type = instrument_type;

    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);
    
    // Handle service errors gracefully  
    if (!result || !result.data) {
      console.error('EmployeeController.getHistory: Service returned no data', { result, employeeEmail, filters });
      throw new Error('Unable to fetch trading requests - service returned no data');
    }
    
    const requests = result.data;
    const pagination = result.pagination;

    // Generate table rows
    const tableRows = requests.map(request => {
      const date = formatHongKongTime(new Date(request.created_at));

      return `
        <tr>
          <td class="text-center">${getDisplayId(request)}</td>
          <td class="text-center">${date}</td>
          <td>${request.stock_name || 'N/A'}</td>
          <td class="text-center font-weight-600">${request.ticker}</td>
          <td class="text-center">
            <span class="badge ${request.instrument_type === 'bond' ? 'badge-info' : 'badge-secondary'}">
              ${request.instrument_type === 'bond' ? 'Bond' : 'Equity'}
            </span>
          </td>
          <td class="text-center">${request.trading_type.toUpperCase()}</td>
          <td class="text-right">${parseInt(request.shares).toLocaleString()}</td>
          <td class="text-right">
            $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
          </td>
          <td class="text-center">
            <span class="status-${request.status}">${request.status.toUpperCase()}</span>
          </td>
          <td class="text-center">
            ${request.status === 'rejected' && request.rejection_reason ? 
              `<span class="text-danger cursor-help text-sm" title="${request.rejection_reason}">View Reason</span>` :
              (request.status === 'pending' && !request.escalated ? 
                `<a href="/escalate-form/${request.uuid}" class="btn btn-outline btn-sm text-decoration-none">Escalate</a>` :
                (request.escalated ? 
                  '<span class="text-warning text-sm">Escalated</span>' :
                  '<span class="text-muted">–</span>')
              )
            }
          </td>
        </tr>
      `;
    });

    // Generate sorting controls
    const currentSortBy = req.query.sort_by || 'created_at';
    const currentSortOrder = req.query.sort_order || 'DESC';
    const sortingControls = generateSortingControls('/employee-history', currentSortBy, currentSortOrder, req.query);

    const historyContent = `
      ${banner}
      
      <!-- Filters Card -->
      <div class="card mb-6">
        <div class="card-header">
          <h3 class="card-title">Filter Requests</h3>
        </div>
        <div class="card-body p-6">
          <form method="get" action="/employee-history">
            <div class="grid grid-auto gap-4 grid-mobile-stack">
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
                  <option value="approved" ${req.query.status === 'approved' ? 'selected' : ''}>Approved</option>
                  <option value="rejected" ${req.query.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                  <option value="pending" ${req.query.status === 'pending' ? 'selected' : ''}>Pending</option>
                </select>
              </div>
              <div>
                <label class="form-label">Instrument:</label>
                <select name="instrument_type" class="form-control-sm">
                  <option value="">All Instruments</option>
                  <option value="equity" ${req.query.instrument_type === 'equity' ? 'selected' : ''}>Equity (Stocks)</option>
                  <option value="bond" ${req.query.instrument_type === 'bond' ? 'selected' : ''}>Bond (ISIN)</option>
                </select>
              </div>
            </div>
            <div class="mt-6 text-center">
              <div class="btn-group btn-group-mobile">
                <button type="submit" class="btn btn-primary w-full-mobile">Apply Filters</button>
                <a href="/employee-history" class="btn btn-secondary text-decoration-none w-full-mobile">Clear Filters</a>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Results Card -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Trading Request History</h3>
          <p class="mt-2 m-0 text-muted text-sm">${pagination ? `${pagination.total} total, showing ${requests.length}` : `${requests.length} requests`} · Page ${pagination?.page || 1} of ${pagination?.pages || 1}</p>
        </div>
        <div class="card-body p-0">
          ${requests.length > 0 ? `
            <div class="table-responsive">
              <table class="modern-table table-zebra table-sticky">
                <thead>
                  <tr>
                    <th class="th-sortable" ${currentSortBy === 'created_at' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'created_at', sort_order: currentSortBy === 'created_at' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         class="link focus-ring">
                        Request ID<span class="sr-only"> - Click to sort</span>
                      </a>
                    </th>
                    <th class="th-sortable" ${currentSortBy === 'created_at' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'created_at', sort_order: currentSortBy === 'created_at' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         class="link focus-ring">
                        Date<span class="sr-only"> - Click to sort</span>
                      </a>
                    </th>
                    <th>Company</th>
                    <th class="th-sortable" ${currentSortBy === 'ticker' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'ticker', sort_order: currentSortBy === 'ticker' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         class="link focus-ring">
                        Ticker/ISIN<span class="sr-only"> - Click to sort</span>
                      </a>
                    </th>
                    <th>Instrument</th>
                    <th>Type</th>
                    <th>Shares</th>
                    <th class="th-sortable" ${currentSortBy === 'total_value_usd' ? `aria-sort="${currentSortOrder === 'ASC' ? 'ascending' : 'descending'}"` : ''}>
                      <a href="/employee-history?${new URLSearchParams({...req.query, sort_by: 'total_value_usd', sort_order: currentSortBy === 'total_value_usd' && currentSortOrder === 'ASC' ? 'DESC' : 'ASC'}).toString()}" 
                         class="link focus-ring">
                        Total Value (USD)<span class="sr-only"> - Click to sort</span>
                      </a>
                    </th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows.join('')}
                </tbody>
              </table>
            </div>
            ${pagination && pagination.pages > 1 ? `
            <div class="pagination">
              ${pagination.page > 1 ? `
                <a href="/employee-history?${new URLSearchParams({...req.query, page: pagination.page - 1}).toString()}" 
                   class="btn btn-secondary btn-sm" aria-label="Go to previous page">←</a>
              ` : '<button class="btn btn-secondary btn-sm" disabled aria-label="Previous page (disabled)">←</button>'}
              
              <span class="btn btn-primary btn-sm" aria-current="page">
                ${pagination.page}
              </span>
              
              ${pagination.page < pagination.pages ? `
                <a href="/employee-history?${new URLSearchParams({...req.query, page: pagination.page + 1}).toString()}" 
                   class="btn btn-secondary btn-sm" aria-label="Go to next page">→</a>
              ` : '<button class="btn btn-secondary btn-sm" disabled aria-label="Next page (disabled)">→</button>'}
              
              <span class="text-muted text-sm">
                ${pagination.total} results
              </span>
            </div>
            ` : ''}
          ` : `
            <div class="text-center p-8 text-muted">
              <p>No trading requests found${Object.keys(filters).length > 0 ? ' matching your filters' : ''}.</p>
              <a href="/employee-dashboard" class="btn btn-primary mt-4 text-decoration-none">
                Submit Your First Request
              </a>
            </div>
          `}
        </div>
      </div>

      <div class="mt-6 text-center">
        <div class="btn-group btn-group-mobile">
          <a href="/employee-dashboard" class="btn btn-secondary text-decoration-none w-full-mobile focus-ring">
            ← Back to Dashboard
          </a>
          <a href="/employee-export-history?${new URLSearchParams(req.query).toString()}" class="btn btn-outline text-decoration-none w-full-mobile focus-ring">
            Export History (CSV)
          </a>
        </div>
      </div>

    `;

    const html = renderEmployeePage('Request History', historyContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * Get escalation form
   */
  getEscalationForm = catchAsync(async (req, res) => {
    const requestUuid = req.params.id; // Now UUID
    
    // Check if user is properly authenticated
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }
    
    const employeeEmail = req.session.employee.email;

    // Get the specific request to validate ownership
    const result = await TradingRequestService.getEmployeeRequests(employeeEmail, {});
    
    // Handle service errors gracefully
    if (!result || !result.data) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Unable to access request data'));
    }
    
    const requests = result.data;
    const request = requests.find(r => r.uuid === requestUuid);

    if (!request) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Request not found or you do not have access to it'));
    }

    if (request.status !== 'pending') {
      return res.redirect('/employee-history?error=' + encodeURIComponent('Only pending requests can be escalated'));
    }

    if (request.escalated) {
      return res.redirect('/employee-history?error=' + encodeURIComponent('This request has already been escalated'));
    }

    const escalationContent = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Escalate Trading Request #${getDisplayId(request)}</h3>
        </div>
        <div class="card-body">
          <div class="bg-muted p-4 border-radius mb-6">
            <h4 class="m-0 mb-3">Request Details:</h4>
            <div class="grid gap-2">
              <div><strong>${request.instrument_type === 'bond' ? 'Bond' : 'Stock'}:</strong> ${request.stock_name} (${request.ticker})</div>
              <div><strong>Type:</strong> ${request.trading_type.toUpperCase()}</div>
              <div><strong>${request.instrument_type === 'bond' ? 'Units' : 'Shares'}:</strong> ${parseInt(request.shares).toLocaleString()}</div>
              <div><strong>Estimated Value:</strong> $${parseFloat(request.total_value_usd || request.total_value || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</div>
              <div><strong>Submitted:</strong> ${formatHongKongTime(new Date(request.created_at))}</div>
            </div>
          </div>

          <form method="post" action="/submit-escalation">\n            ${req.csrfInput()}
            <input type="hidden" name="requestId" value="${request.uuid}">
            
            <div class="mb-4">
              <label class="form-label">
                Escalation Reason: <span class="text-danger">*</span>
              </label>
              <textarea name="escalation_reason" required rows="5" 
                        placeholder="Please explain why you are escalating this request. Provide any additional context or urgency that administrators should be aware of."
                        class="form-control resize-vertical"></textarea>
              <small class="form-text">
                Escalating a request will notify administrators for priority review. Please provide a clear reason.
              </small>
            </div>

            <div class="text-right mt-6">
              <a href="/employee-history" class="btn btn-secondary text-decoration-none mr-3">
                Cancel
              </a>
              <button type="submit" class="btn btn-warning">
                Escalate Request
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const html = renderEmployeePage('Escalate Request', escalationContent, req.session.employee.name, req.session.employee.email);
    res.send(html);
  });

  /**
   * Export employee history as CSV
   */
  exportHistory = catchAsync(async (req, res) => {
    // Check authentication (redundant check for safety)
    if (!req.session.employee || !req.session.employee.email) {
      return res.redirect('/?error=authentication_required');
    }

    const { start_date, end_date, ticker, trading_type, instrument_type, sort_by = 'created_at', sort_order = 'DESC' } = req.query;
    const employeeEmail = req.session.employee.email;
    
    try {
      // Build filters (no pagination for CSV export - explicitly exclude page/limit)
      const filters = {};
      if (start_date) filters.start_date = start_date;
      if (end_date) filters.end_date = end_date;
      if (ticker) filters.ticker = ticker.toUpperCase();
      if (trading_type) filters.trading_type = trading_type;
      if (instrument_type) filters.instrument_type = instrument_type;

      const result = await TradingRequestService.getEmployeeRequests(employeeEmail, filters, sort_by, sort_order);
      
      // Handle service errors gracefully
      if (!result || !result.data) {
        throw new Error('Unable to fetch trading requests for export - service returned no data');
      }
      
      const requests = result.data;

      // Debug logging
      console.log('Export debug info:', {
        employeeEmail,
        filters,
        requestCount: requests ? requests.length : 0,
        sort_by,
        sort_order
      });

      if (!requests) {
        throw new Error('No data returned from database query');
      }

    // Create filename with filters
    let filterSuffix = '';
    if (start_date && end_date) {
      filterSuffix = `-${start_date}-to-${end_date}`;
    } else if (start_date) {
      filterSuffix = `-from-${start_date}`;
    } else if (end_date) {
      filterSuffix = `-until-${end_date}`;
    }
    if (ticker) filterSuffix += `-${ticker}`;
    if (trading_type) filterSuffix += `-${trading_type}`;
    if (instrument_type) filterSuffix += `-${instrument_type}`;

    let timestamp;
    try {
      timestamp = formatHongKongTime(new Date(), true).replace(/[/:,\s]/g, '-');
    } catch (timeError) {
      console.error('Error formatting timestamp:', timeError);
      timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    }
    const filename = `my-trading-history${filterSuffix}-${timestamp}.csv`;

    let csvContent = 'Request ID,Date Created,Stock Name,Ticker,Trading Type,Shares,Estimated Value,Status,Escalated,Rejection Reason\n';
    
    // Handle empty results case
    if (!requests || requests.length === 0) {
      csvContent += '"No trading requests found for the selected criteria"\n';
    } else {
      requests.forEach((request, index) => {
        try {
          // Log the request object structure for debugging
          console.log(`Processing request ${index}:`, {
            uuid: request.uuid,
            created_at: request.created_at,
            stock_name: request.stock_name,
            ticker: request.ticker,
            trading_type: request.trading_type,
            shares: request.shares,
            status: request.status,
            keys: Object.keys(request)
          });

          // Process each field individually with error handling
          let createdDate = 'N/A';
          try {
            if (request.created_at) {
              createdDate = formatHongKongTime(new Date(request.created_at));
            }
          } catch (dateError) {
            console.error('Date formatting error:', dateError);
            createdDate = request.created_at || 'N/A';
          }

          let stockName = 'N/A';
          try {
            stockName = (request.stock_name || 'N/A').toString().replace(/"/g, '""');
          } catch (nameError) {
            console.error('Stock name error:', nameError);
          }

          let estimatedValue = '0.00';
          try {
            const value = request.total_value_usd || request.total_value || 0;
            estimatedValue = parseFloat(value || 0).toFixed(2);
          } catch (valueError) {
            console.error('Value error:', valueError);
          }

          const escalated = (request.escalated === true || request.escalated === 'true') ? 'Yes' : 'No';
          const rejectionReason = (request.rejection_reason || '').toString().replace(/"/g, '""');
          const ticker = (request.ticker || 'N/A').toString();
          const tradingType = (request.trading_type || 'unknown').toString().toUpperCase();
          const status = (request.status || 'unknown').toString().toUpperCase();
          const shares = parseInt(request.shares || 0) || 0;
          const requestId = getDisplayId(request) || 'N/A';
          
          csvContent += `"${requestId}","${createdDate}","${stockName}","${ticker}","${tradingType}","${shares}","$${estimatedValue}","${status}","${escalated}","${rejectionReason}"\n`;
          
        } catch (rowError) {
          console.error('Error processing row:', rowError.message, 'Request keys:', request ? Object.keys(request) : 'null');
          console.error('Full request object:', request);
          csvContent += `"Error processing request ${request?.uuid || 'unknown'}: ${rowError.message}"\n`;
        }
      });
    }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error('Export history error:', error);
      return res.redirect('/employee-history?error=export_failed');
    }
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

function generateSortingControls(baseUrl, currentSortBy, currentSortOrder, queryParams = {}) {
  // Remove existing sort parameters
  const cleanParams = { ...queryParams };
  delete cleanParams.sort_by;
  delete cleanParams.sort_order;
  
  return `
    <form method="get" action="${baseUrl}" class="d-flex align-items-center gap-3 flex-wrap">
      ${Object.entries(cleanParams).map(([key, value]) => 
        `<input type="hidden" name="${key}" value="${value || ''}">`
      ).join('')}
      
      <span class="font-weight-600 text-gray-600">Sort by:</span>
      <select name="sort_by" class="form-control-sm py-2">
        <option value="created_at" ${currentSortBy === 'created_at' ? 'selected' : ''}>Date</option>
        <option value="ticker" ${currentSortBy === 'ticker' ? 'selected' : ''}>Ticker</option>
      </select>
      <select name="sort_order" class="form-control-sm py-2">
        <option value="DESC" ${currentSortOrder === 'DESC' ? 'selected' : ''}>↓ Descending</option>
        <option value="ASC" ${currentSortOrder === 'ASC' ? 'selected' : ''}>↑ Ascending</option>
      </select>
      <button type="submit" class="btn btn-primary btn-sm">
        Apply Sort
      </button>
    </form>
  `;
}

module.exports = new EmployeeController();