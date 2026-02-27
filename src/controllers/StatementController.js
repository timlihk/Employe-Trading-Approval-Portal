const StatementRequestService = require('../services/StatementRequestService');
const StatementRequest = require('../models/StatementRequest');
const ScheduledStatementService = require('../services/ScheduledStatementService');
const AuditLog = require('../models/AuditLog');
const { catchAsync } = require('../middleware/errorHandler');
const { renderAdminPage, renderPublicPage, generateNotificationBanner, renderCard, renderTable } = require('../utils/templates');
const { formatUuid } = require('../utils/formatters');

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
        <div class="card mb-6" style="max-width: 560px; margin: 40px auto;">
          <div class="card-header">
            <h3 class="card-title">Invalid or Expired Link</h3>
          </div>
          <div class="card-body text-center">
            <p class="mb-4">This upload link is no longer valid. It may have expired or the statement has already been uploaded.</p>
            <a href="/" class="btn btn-primary">Go to Portal</a>
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

    const content = `
        ${banner}
        <div class="card mb-6" style="max-width: 560px; margin: 0 auto;">
          <div class="card-header">
            <h3 class="card-title">Upload Trading Statement</h3>
          </div>
          <div class="card-body">
            <div class="mb-4">
              <p class="mb-2"><strong>Period:</strong> ${monthName} ${request.period_year}</p>
              <p class="mb-2"><strong>Employee:</strong> ${request.employee_name || request.employee_email}</p>
              <p class="mb-2"><strong>Deadline:</strong> ${deadlineStr}${isOverdue ? ' <span class="text-danger">(Overdue)</span>' : ''}</p>
            </div>

            <form method="post" action="/upload-statement/${token}" enctype="multipart/form-data">
              <div class="mb-4">
                <label class="form-label"><strong>Statement File</strong></label>
                <p class="text-muted text-sm mb-2">Accepted: PDF, PNG, JPG, CSV, XLSX (max 10MB)</p>
                <input type="file" name="statement" required
                       accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx"
                       class="form-control">
              </div>
              <div class="mb-4">
                <label class="form-label"><strong>Notes</strong> (optional)</label>
                <textarea name="notes" rows="3"
                          placeholder="Any additional notes about this statement..."
                          class="form-control" style="resize: vertical;"></textarea>
              </div>
              <button type="submit" class="btn btn-primary" style="width: 100%;">
                Upload Statement
              </button>
            </form>
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
    const { notes } = req.body;

    if (!file) {
      return res.redirect(`/upload-statement/${token}?error=${encodeURIComponent('Please select a file to upload')}`);
    }

    try {
      const result = await StatementRequestService.processUpload(token, file, notes);

      const content = `
        <div class="card mb-6" style="max-width: 560px; margin: 40px auto;">
          <div class="card-header">
            <h3 class="card-title">Statement Uploaded Successfully</h3>
          </div>
          <div class="card-body text-center">
            <div class="alert-success border rounded p-4 mb-4">
              <strong>Your ${result.period} trading statement has been received.</strong>
            </div>
            <p class="mb-2"><strong>File:</strong> ${result.originalFilename}</p>
            <p class="text-muted text-sm mb-4">The file has been securely uploaded to the compliance document library.</p>
            <a href="/" class="btn btn-primary">Go to Portal</a>
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

    // Period selector form
    const periodOptions = [];
    // Generate last 12 months as options
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mName = d.toLocaleString('en-US', { month: 'long' });
      const selected = (y === year && m === month) ? 'selected' : '';
      periodOptions.push(`<option value="${y}-${m}" ${selected}>${mName} ${y}</option>`);
    }

    const periodSelector = `
      <form method="get" action="/admin-statements" class="mb-4" style="display: flex; gap: 0.5rem; align-items: center;">
        <label class="form-label m-0"><strong>Period:</strong></label>
        <select name="period" class="form-control" style="max-width: 200px;"
                onchange="this.form.submit()">
          ${periodOptions.join('')}
        </select>
        <input type="hidden" name="year" value="${year}">
        <input type="hidden" name="month" value="${month}">
        <noscript><button type="submit" class="btn btn-secondary">Go</button></noscript>
      </form>`;

    // Summary stats
    const total = summary?.total || 0;
    const uploaded = summary?.uploaded || 0;
    const pending = summary?.pending || 0;
    const overdue = summary?.overdue || 0;
    const emailsSent = summary?.emails_sent || 0;

    const summaryCard = renderCard(`Statement Requests - ${monthName} ${year}`, `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem;">
        <div class="text-center">
          <div class="text-2xl font-bold">${total}</div>
          <div class="text-muted text-sm">Total</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold">${emailsSent}</div>
          <div class="text-muted text-sm">Emails Sent</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold" style="color: #28a745;">${uploaded}</div>
          <div class="text-muted text-sm">Uploaded</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold" style="color: #ffc107;">${pending}</div>
          <div class="text-muted text-sm">Pending</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold" style="color: #dc3545;">${overdue}</div>
          <div class="text-muted text-sm">Overdue</div>
        </div>
      </div>
    `);

    // Requests table
    const tableHeaders = ['Employee', 'Status', 'Email Sent', 'Uploaded', 'File', 'Actions'];
    const tableRows = (requests || []).map(r => {
      const statusColors = {
        uploaded: 'color: #28a745;',
        pending: 'color: #ffc107;',
        overdue: 'color: #dc3545;',
        skipped: 'color: #6c757d;'
      };
      const statusStyle = statusColors[r.status] || '';
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
        ? `<form method="post" action="/admin-resend-statement-email" style="display: inline;">
             ${req.csrfInput()}
             <input type="hidden" name="statement_request_uuid" value="${r.uuid}">
             <button type="submit" class="btn btn-sm btn-secondary">Resend</button>
           </form>`
        : '';

      return `<tr>
        <td>${r.employee_name || r.employee_email}<br><span class="text-muted text-sm">${r.employee_email}</span></td>
        <td><strong style="${statusStyle}">${r.status.toUpperCase()}</strong></td>
        <td>${emailSentDate}</td>
        <td>${uploadedDate}</td>
        <td class="text-sm">${fileLink}</td>
        <td>${resendForm}</td>
      </tr>`;
    });

    const table = renderTable(tableHeaders, tableRows, 'No statement requests for this period. Use the scheduler to send requests.');

    // Action buttons
    const actions = `
      <div class="mb-4" style="display: flex; gap: 0.5rem;">
        <form method="post" action="/admin-trigger-statement-request">
          ${req.csrfInput()}
          <button type="submit" class="btn btn-primary">Send Monthly Emails Now</button>
        </form>
        <a href="/admin-statement-scheduler" class="btn btn-secondary">Scheduler Settings</a>
      </div>`;

    const content = `
        ${banner}
        ${actions}
        ${periodSelector}
        ${summaryCard}
        ${table}`;

    const html = renderAdminPage('Statement Requests', content);
    res.send(html);
  });

  /**
   * GET /admin-statement-scheduler
   * Show scheduler status and configuration.
   */
  getSchedulerStatus = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    const banner = generateNotificationBanner(req.query);
    const status = ScheduledStatementService.getStatus();

    const content = `
        ${banner}
        ${renderCard('Statement Request Scheduler', `
          <div class="mb-4">
            <p><strong>Status:</strong> ${status.isRunning ? '<span style="color: #28a745;">Running</span>' : '<span style="color: #dc3545;">Stopped</span>'}</p>
            <p><strong>Schedule:</strong> ${status.schedule || 'Not configured'}</p>
            <p><strong>Timezone:</strong> ${status.timezone}</p>
            <p><strong>Next Run:</strong> ${status.nextRun || 'N/A'}</p>
          </div>
          <div class="mb-4">
            <h4>Configuration</h4>
            <p class="text-muted text-sm">
              The scheduler is configured via environment variables:<br>
              <code>STATEMENT_REQUEST_SCHEDULE</code> - Cron schedule (default: 1st of month at 9 AM HKT)<br>
              <code>STATEMENT_SENDER_EMAIL</code> - Sender email address<br>
              <code>STATEMENT_UPLOAD_DEADLINE_DAYS</code> - Days until deadline (default: 14)<br>
              <code>SHAREPOINT_SITE_URL</code> - SharePoint site for file storage<br>
              <code>DISABLE_STATEMENT_REQUESTS</code> - Set to "true" to disable
            </p>
          </div>
          <form method="post" action="/admin-trigger-statement-request">
            ${req.csrfInput()}
            <button type="submit" class="btn btn-primary">Trigger Manual Send</button>
          </form>
        `)}
        <a href="/admin-statements" class="btn btn-secondary">Back to Statements</a>`;

    const html = renderAdminPage('Statement Scheduler', content);
    res.send(html);
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
