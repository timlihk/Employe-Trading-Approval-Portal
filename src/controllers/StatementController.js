const StatementRequestService = require('../services/StatementRequestService');
const StatementRequest = require('../models/StatementRequest');
const BrokerageAccount = require('../models/BrokerageAccount');
const ScheduledStatementService = require('../services/ScheduledStatementService');
const GraphAPIService = require('../services/GraphAPIService');
const AuditLog = require('../models/AuditLog');
const { catchAsync } = require('../middleware/errorHandler');
const { renderAdminPage, renderPublicPage, generateNotificationBanner } = require('../utils/templates');
const renderInvalidLink = require('../templates/statement/invalidLink');
const renderUploadForm = require('../templates/statement/uploadForm');
const renderUploadComplete = require('../templates/statement/uploadComplete');
const renderAdminDashboard = require('../templates/statement/adminDashboard');
const renderScheduler = require('../templates/statement/scheduler');

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
      return res.send(renderPublicPage('Upload Statement', renderInvalidLink()));
    }

    const monthName = new Date(request.period_year, request.period_month - 1)
      .toLocaleString('en-US', { month: 'long' });
    const deadlineStr = request.deadline_at
      ? new Date(request.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'N/A';
    const isOverdue = request.deadline_at && new Date(request.deadline_at) < new Date();

    const accounts = await BrokerageAccount.getByEmployee(request.employee_email);
    const accountOptions = accounts.map(a =>
      `<option value="${a.firm_name} — ${a.account_number}">${a.firm_name} — ${a.account_number}</option>`
    ).join('');

    const content = renderUploadForm({
      banner,
      token,
      monthName,
      periodYear: request.period_year,
      employeeDisplay: request.employee_name || request.employee_email,
      deadlineStr,
      isOverdue,
      accountOptions,
    });

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

    let brokerageName = '';
    if (brokerage_select === '__new__' && brokerage_new && brokerage_new.trim()) {
      brokerageName = brokerage_new.trim();
    } else if (brokerage_select && brokerage_select !== '__new__') {
      brokerageName = brokerage_select;
    }

    try {
      const result = await StatementRequestService.processUpload(token, file, notes, brokerageName);
      const content = renderUploadComplete({
        period: result.period,
        originalFilename: result.originalFilename,
      });
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

    const now = new Date();
    const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = parseInt(req.query.year) || defaultDate.getFullYear();
    const month = parseInt(req.query.month) || (defaultDate.getMonth() + 1);

    const { summary, requests } = await StatementRequestService.getAdminDashboardData(year, month);

    const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

    const periodOptions = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mName = d.toLocaleString('en-US', { month: 'long' });
      const selected = (y === year && m === month) ? 'selected' : '';
      periodOptions.push(`<option value="${y}-${m}" ${selected}>${mName} ${y}</option>`);
    }

    const content = renderAdminDashboard({
      banner,
      year,
      month,
      monthName,
      periodOptions,
      summary,
      requests,
      csrfInput: req.csrfInput(),
    });

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

    const content = renderScheduler({
      banner,
      status,
      csrfInput: req.csrfInput(),
    });

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

  /**
   * POST /admin-test-sharepoint
   * Test SharePoint connectivity and report diagnostic results.
   */
  testSharePoint = catchAsync(async (req, res) => {
    if (!req.session.admin) return res.redirect('/admin-login');

    try {
      const results = await GraphAPIService.testSharePointConnection();
      const allOk = results.steps.every(s => s.status === 'ok');

      if (allOk) {
        res.redirect('/admin-statement-scheduler?message=' + encodeURIComponent('SharePoint connection successful — all checks passed'));
      } else {
        const failedStep = results.steps.find(s => s.status === 'fail');
        res.redirect('/admin-statement-scheduler?error=' + encodeURIComponent(`SharePoint test failed at "${failedStep.step}": ${failedStep.detail}`));
      }
    } catch (error) {
      res.redirect('/admin-statement-scheduler?error=' + encodeURIComponent('SharePoint test error: ' + error.message));
    }
  });

  /**
   * GET /statement-file/:uuid
   * Proxy download: fetches the file from SharePoint and serves it directly.
   * Accessible by the employee who owns it or by admins.
   */
  downloadFile = catchAsync(async (req, res) => {
    const { uuid } = req.params;
    const request = await StatementRequest.findByUuid(uuid);

    if (!request || !request.sharepoint_item_id) {
      return res.status(404).send('File not found');
    }

    const isAdmin = req.session.admin;
    const isOwner = req.session.employee && req.session.employee.email.toLowerCase() === request.employee_email;
    if (!isAdmin && !isOwner) {
      return res.status(403).send('Access denied');
    }

    const { buffer, contentType } = await GraphAPIService.downloadSharePointFile(request.sharepoint_item_id);
    const filename = request.original_filename || 'statement';

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': buffer.length
    });
    res.send(buffer);
  });
}

module.exports = new StatementController();
