const StatementRequestService = require('../services/StatementRequestService');
const StatementRequest = require('../models/StatementRequest');
const ScheduledStatementService = require('../services/ScheduledStatementService');
const AuditLog = require('../models/AuditLog');
const { catchAsync } = require('../middleware/errorHandler');
const { renderAdminPage, renderPublicPage, generateNotificationBanner, renderCard, renderTable } = require('../utils/templates');

class StatementController {

  // ========================================================
  // PUBLIC ROUTES (token-authenticated, no session required)
  // ========================================================

  /**
   * GET /upload-statement/:token
   * Display the upload form for an employee with a valid upload token.
   */
  getUploadPage = catchAsync(async (req, res) => {
    const { token } = req.params;
    const banner = generateNotificationBanner(req.query);
    const request = await StatementRequestService.validateUploadToken(token);

    if (!request) {
      const content = `
        <div class="upload-container">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Invalid or Expired Link</h3>
            </div>
            <div class="card-body text-center">
              <p class="mb-4">This upload link is no longer valid. It may have expired or the statement has already been uploaded.</p>
              <a href="/" class="btn btn-primary">Go to Portal</a>
            </div>
          </div>
        </div>`;
      return res.send(renderPublicPage('Upload Statement', content));
    }

    const monthName = new Date(request.period_year, request.period_month - 1)
      .toLocaleString('en-US', { month: 'long' });
    const deadlineStr = request.deadline_at
      ? new Date(request.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'N/A';
    const isOverdue = request.deadline_at && new Date(request.deadline_at) < new Date();

    // Get historical brokerages for this employee
    const brokerages = await StatementRequest.getDistinctBrokerages(request.employee_email);
    const brokerageOptions = brokerages.map(b =>
      `<option value="${b}">${b}</option>`
    ).join('');

    const content = `
        ${banner}
        <div class="upload-container">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Upload Trading Statement</h3>
            </div>
            <div class="card-body">
              <dl class="upload-meta">
                <dt>Period</dt>
                <dd>${monthName} ${request.period_year}</dd>
                <dt>Employee</dt>
                <dd>${request.employee_name || request.employee_email}</dd>
                <dt>Deadline</dt>
                <dd>${deadlineStr}${isOverdue ? ' <span class="table-status overdue">Overdue</span>' : ''}</dd>
              </dl>

              <form method="post" action="/upload-statement/${token}" enctype="multipart/form-data">
                <div class="mb-6">
                  <label class="form-label">Brokerage</label>
                  <select name="brokerage_select" class="form-control">
                    <option value="">Select brokerage...</option>
                    ${brokerageOptions}
                    <option value="__new__">+ Add new brokerage</option>
                  </select>
                </div>
                <div class="mb-6" id="new-brokerage-row" style="display:none">
                  <label class="form-label">New Brokerage Name</label>
                  <input type="text" name="brokerage_new" placeholder="e.g., Interactive Brokers, Charles Schwab..."
                         class="form-control" maxlength="255">
                </div>
                <style>
                  select:has(option[value="__new__"]:checked) ~ #new-brokerage-row { display: block !important; }
                </style>
                <div class="mb-6">
                  <label class="form-label">Statement File</label>
                  <div class="file-input-wrapper">
                    <input type="file" name="statement" required
                           accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx">
                    <span class="file-input-icon">&#128196;</span>
                    <span class="file-input-text">Click to select a file</span>
                    <span class="file-input-hint">PDF, PNG, JPG, CSV, XLSX — max 10 MB</span>
                  </div>
                </div>
                <div class="mb-6">
                  <label class="form-label">Notes (optional)</label>
                  <textarea name="notes" rows="3"
                            placeholder="Any additional notes about this statement..."
                            class="form-control resize-vertical"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-full">
                  Upload Statement
                </button>
              </form>
            </div>
          </div>
        </div>`;

    res.send(renderPublicPage('Upload Trading Statement', content));
  });

  /**
   * POST /upload-statement/:token
   * Process the uploaded file (multer middleware runs before this).
   */
  processUpload = catchAsync(async (req, res) => {
    const { token } = req.params;
    const file = req.file;
    const { notes, brokerage_select, brokerage_new } = req.body;

    if (!file) {
      return res.redirect(`/upload-statement/${token}?error=${encodeURIComponent('Please select a file to upload')}`);
    }

    // Determine brokerage name
    let brokerageName = '';
    if (brokerage_select === '__new__' && brokerage_new && brokerage_new.trim()) {
      brokerageName = brokerage_new.trim();
    } else if (brokerage_select && brokerage_select !== '__new__') {
      brokerageName = brokerage_select;
    }

    try {
      const result = await StatementRequestService.processUpload(token, file, notes, brokerageName);

      const content = `
        <div class="upload-container">
          <div class="card">
            <div class="card-body">
              <div class="upload-success">
                <div class="upload-success-icon">&#10003;</div>
                <h3>Statement Uploaded</h3>
                <p class="mb-4">Your <strong>${result.period}</strong> trading statement has been received and securely stored.</p>
                <p class="mb-6"><strong>File:</strong> ${result.originalFilename}</p>
                <a href="/" class="btn btn-primary">Go to Portal</a>
              </div>
            </div>
          </div>
        </div>`;
      res.send(renderPublicPage('Upload Complete', content));
    } catch (error) {
      return res.redirect(`/upload-statement/${token}?error=${encodeURIComponent(error.message)}`);
    }
  });

  // ========================================================
  // ADMIN ROUTES
  // ========================================================

  /**
   * GET /admin-statements
   * Admin dashboard showing all statement requests for a selected period.
   */
  getStatementsDashboard = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    const banner = generateNotificationBanner(req.query);

    // Default to previous month
    const now = new Date();
    const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = parseInt(req.query.year) || defaultDate.getFullYear();
    const month = parseInt(req.query.month) || (defaultDate.getMonth() + 1);

    const { summary, requests, availablePeriods } = await StatementRequestService.getAdminDashboardData(year, month);

    const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

    // Period selector options
    const periodOptions = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mName = d.toLocaleString('en-US', { month: 'long' });
      const selected = (y === year && m === month) ? 'selected' : '';
      periodOptions.push(`<option value="${y}-${m}" ${selected}>${mName} ${y}</option>`);
    }

    // Summary stats
    const total = summary?.total || 0;
    const uploaded = summary?.uploaded || 0;
    const pending = summary?.pending || 0;
    const overdue = summary?.overdue || 0;
    const emailsSent = summary?.emails_sent || 0;

    const summaryCard = renderCard(`${monthName} ${year}`, `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-info">${emailsSent}</div>
          <div class="stat-label">Emails Sent</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-success">${uploaded}</div>
          <div class="stat-label">Uploaded</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-warning">${pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-item">
          <div class="stat-value stat-danger">${overdue}</div>
          <div class="stat-label">Overdue</div>
        </div>
      </div>
    `);

    // Requests table
    const tableHeaders = ['Employee', 'Brokerage', 'Status', 'Email Sent', 'Uploaded', 'File', 'Actions'];
    const tableRows = (requests || []).map(r => {
      const emailSentDate = r.email_sent_at
        ? new Date(r.email_sent_at).toLocaleDateString('en-GB')
        : '-';
      const uploadedDate = r.uploaded_at
        ? new Date(r.uploaded_at).toLocaleDateString('en-GB')
        : '-';
      const fileInfo = r.original_filename || '-';
      const fileLink = r.sharepoint_file_url
        ? `<a href="${r.sharepoint_file_url}" target="_blank" rel="noopener">${fileInfo}</a>`
        : fileInfo;

      const resendForm = r.status !== 'uploaded'
        ? `<form method="post" action="/admin-resend-statement-email" class="d-inline">
             ${req.csrfInput()}
             <input type="hidden" name="statement_request_uuid" value="${r.uuid}">
             <button type="submit" class="btn btn-sm btn-secondary">Resend</button>
           </form>`
        : '';

      return `<tr>
        <td>
          <span class="font-weight-600">${r.employee_name || r.employee_email}</span><br>
          <span class="text-muted text-sm">${r.employee_email}</span>
        </td>
        <td class="text-sm">${r.brokerage_name || '-'}</td>
        <td><span class="table-status ${r.status}">${r.status.toUpperCase()}</span></td>
        <td class="table-date">${emailSentDate}</td>
        <td class="table-date">${uploadedDate}</td>
        <td class="text-sm">${fileLink}</td>
        <td>${resendForm}</td>
      </tr>`;
    });

    const table = renderTable(tableHeaders, tableRows, 'No statement requests for this period. Use the button above to send requests.');

    const content = `
        ${banner}
        <div class="action-bar">
          <form method="post" action="/admin-trigger-statement-request">
            ${req.csrfInput()}
            <button type="submit" class="btn btn-primary">Send Monthly Emails Now</button>
          </form>
          <a href="/admin-statement-scheduler" class="btn btn-secondary">Scheduler Settings</a>
        </div>

        <form method="get" action="/admin-statements" class="period-selector">
          <label class="form-label">Period:</label>
          <select name="period" class="form-control">
            ${periodOptions.join('')}
          </select>
          <input type="hidden" name="year" value="${year}">
          <input type="hidden" name="month" value="${month}">
          <button type="submit" class="btn btn-secondary">Go</button>
        </form>

        ${summaryCard}
        ${table}`;

    res.send(renderAdminPage('Statement Requests', content));
  });

  /**
   * GET /admin-statement-scheduler
   * Show scheduler status and configuration.
   */
  getSchedulerStatus = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    const banner = generateNotificationBanner(req.query);
    const status = ScheduledStatementService.getStatus();

    const statusDot = status.isRunning
      ? '<span class="status-indicator"><span class="status-dot status-dot-success"></span> Running</span>'
      : '<span class="status-indicator"><span class="status-dot status-dot-danger"></span> Stopped</span>';

    const content = `
        ${banner}
        ${renderCard('Statement Request Scheduler', `
          <div class="scheduler-panel">
            <div class="scheduler-row">
              <span class="scheduler-label">Status</span>
              <span class="scheduler-value">${statusDot}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Schedule</span>
              <span class="scheduler-value">${status.schedule || 'Not configured'}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Timezone</span>
              <span class="scheduler-value">${status.timezone}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Next Run</span>
              <span class="scheduler-value">${status.nextRun || 'N/A'}</span>
            </div>
            <div class="scheduler-row">
              <span class="scheduler-label">Daily Reminders</span>
              <span class="scheduler-value">${status.reminderSchedule || 'Every day at 9 AM HKT'}</span>
            </div>
          </div>

          <div class="config-hint">
            <h4>Environment Variables</h4>
            <p class="text-sm text-muted">
              <code>STATEMENT_REQUEST_SCHEDULE</code> Cron schedule (default: 7th of month, 9 AM HKT)<br>
              <code>STATEMENT_SENDER_EMAIL</code> Sender email address<br>
              <code>STATEMENT_UPLOAD_DEADLINE_DAYS</code> Days until deadline (default: 14)<br>
              <code>SHAREPOINT_SITE_URL</code> SharePoint site for file storage<br>
              <code>DISABLE_STATEMENT_REQUESTS</code> Set to "true" to disable
            </p>
          </div>

          <form method="post" action="/admin-trigger-statement-request">
            ${req.csrfInput()}
            <button type="submit" class="btn btn-primary">Trigger Manual Send</button>
          </form>
        `)}
        <a href="/admin-statements" class="btn btn-secondary mt-4">Back to Statements</a>`;

    res.send(renderAdminPage('Statement Scheduler', content));
  });

  /**
   * POST /admin-trigger-statement-request
   * Manually trigger the monthly statement request cycle.
   */
  triggerStatementRequest = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    const adminEmail = req.session.admin.username;

    await AuditLog.logActivity(
      adminEmail, 'admin', 'statement_request_manual_trigger',
      'system', null,
      'Admin manually triggered statement request cycle',
      req.ip
    );

    try {
      await ScheduledStatementService.triggerManual();
      res.redirect('/admin-statements?message=statement_emails_sent');
    } catch (error) {
      res.redirect(`/admin-statements?error=${encodeURIComponent('Statement request cycle failed: ' + error.message)}`);
    }
  });

  /**
   * POST /admin-resend-statement-email
   * Resend the statement request email to a specific employee.
   */
  resendEmail = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    const { statement_request_uuid } = req.body;
    const adminEmail = req.session.admin.username;

    const request = await StatementRequest.findByUuid(statement_request_uuid);
    if (!request) {
      return res.redirect('/admin-statements?error=Statement+request+not+found');
    }

    try {
      await StatementRequestService.sendStatementRequestEmail(
        { email: request.employee_email, name: request.employee_name },
        request.upload_token,
        { year: request.period_year, month: request.period_month }
      );
      await StatementRequest.incrementReminderCount(request.uuid);

      await AuditLog.logActivity(
        adminEmail, 'admin', 'statement_email_resent',
        'statement_request', request.uuid,
        `Resent statement email to ${request.employee_email}`,
        req.ip
      );

      res.redirect('/admin-statements?message=statement_email_resent');
    } catch (error) {
      res.redirect(`/admin-statements?error=${encodeURIComponent('Failed to resend: ' + error.message)}`);
    }
  });
}

module.exports = new StatementController();
