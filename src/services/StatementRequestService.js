const StatementRequest = require('../models/StatementRequest');
const GraphAPIService = require('./GraphAPIService');
const AuditLog = require('../models/AuditLog');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class StatementRequestService {

  /**
   * Execute a full monthly statement request cycle:
   * 1. Determine the period (previous month)
   * 2. Fetch employees from Azure AD
   * 3. Create DB records for each employee
   * 4. Send email to each employee with unique upload link
   * 5. Audit log everything
   */
  async executeMonthlyRequest() {
    const now = new Date();
    // Request statements for the previous month
    const periodDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = {
      year: periodDate.getFullYear(),
      month: periodDate.getMonth() + 1
    };

    const monthName = periodDate.toLocaleString('en-US', { month: 'long' });
    logger.info(`Starting monthly statement request for ${monthName} ${period.year}`);

    // Fetch employees from Azure AD
    let employees;
    try {
      employees = await GraphAPIService.getEmployees();
    } catch (error) {
      logger.error('Failed to fetch employees from Azure AD:', error.message);
      await AuditLog.logActivity(
        'system', 'admin', 'statement_request_cycle_failed',
        'system', null,
        `Failed to fetch employees: ${error.message}`
      );
      throw error;
    }

    if (!employees || employees.length === 0) {
      logger.warn('No employees found in Azure AD — skipping statement request cycle');
      return { sent: 0, skipped: 0, failed: 0, period };
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const employee of employees) {
      try {
        // Create DB record (skips duplicates via ON CONFLICT)
        const request = await StatementRequest.createRequest({
          period_year: period.year,
          period_month: period.month,
          employee_email: employee.email,
          employee_name: employee.name
        });

        if (!request) {
          // Already exists for this period — skip
          skipped++;
          continue;
        }

        // Send email with upload link
        await this.sendStatementRequestEmail(employee, request.upload_token, period);
        sent++;

        // Small delay between emails to be courteous to Graph API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Failed to process statement request for ${employee.email}:`, error.message);
        failed++;
      }
    }

    logger.info(`Statement request cycle complete: ${sent} sent, ${skipped} skipped, ${failed} failed`);

    await AuditLog.logActivity(
      'system', 'admin', 'statement_request_cycle_completed',
      'system', null,
      `Period: ${monthName} ${period.year}. Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`
    );

    return { sent, skipped, failed, period };
  }

  /**
   * Send a statement request email to a single employee.
   */
  async sendStatementRequestEmail(employee, uploadToken, period) {
    const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const uploadUrl = `${frontendUrl}/upload-statement/${uploadToken}`;

    const deadlineDays = parseInt(process.env.STATEMENT_UPLOAD_DEADLINE_DAYS) || 14;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);

    const monthName = new Date(period.year, period.month - 1).toLocaleString('en-US', { month: 'long' });
    const subject = `Monthly Trading Statement Request - ${monthName} ${period.year}`;

    const htmlBody = this.generateEmailBody(
      employee.name || employee.email,
      uploadUrl,
      { ...period, monthName },
      deadline
    );

    try {
      await GraphAPIService.sendEmail(employee.email, subject, htmlBody);

      await AuditLog.logActivity(
        'system', 'admin', 'statement_email_sent',
        'statement_request', null,
        `Email sent to ${employee.email} for ${monthName} ${period.year}`
      );
    } catch (error) {
      logger.error(`Failed to send statement email to ${employee.email}:`, error.message);
      await AuditLog.logActivity(
        'system', 'admin', 'statement_email_failed',
        'statement_request', null,
        `Failed to send to ${employee.email}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Generate the HTML email body for the statement request.
   * Uses inline CSS for email client compatibility (no external CSS/JS).
   */
  generateEmailBody(employeeName, uploadUrl, period, deadline) {
    const deadlineStr = deadline.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #1a237e; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">Monthly Trading Statement Request</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e0e0e0; border-top: none;">
          <p>Dear ${employeeName},</p>
          <p>Please upload your trading/brokerage account statement for
             <strong>${period.monthName} ${period.year}</strong>.</p>
          <p>This is required under the Company's Personal Dealing Policy for
             compliance monitoring purposes.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${uploadUrl}"
               style="background: #1a237e; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 4px; font-weight: bold;
                      display: inline-block;">
              Upload Statement
            </a>
          </p>
          <p><strong>Deadline:</strong> ${deadlineStr}</p>
          <p>If you have multiple brokerage accounts, please upload a statement
             for each account separately by requesting additional upload links
             from the Compliance team.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
          <p style="color: #888; font-size: 12px;">
            Employee Trading Compliance Portal<br>
            This is an automated message. Please do not reply to this email.<br>
            If you have questions, please contact the Compliance team.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Validate an upload token and return the statement request.
   * Returns null if token is invalid, expired, or already used.
   */
  async validateUploadToken(token) {
    if (!token || typeof token !== 'string' || token.length !== 64) {
      return null;
    }

    const request = await StatementRequest.findByUploadToken(token);
    if (!request) return null;

    // Already uploaded
    if (request.status === 'uploaded') return null;

    // Check deadline (allow overdue uploads — still valid, just late)
    return request;
  }

  /**
   * Process a file upload from an employee.
   * 1. Validate the upload token
   * 2. Build SharePoint folder path with period subfolder
   * 3. Upload file to SharePoint
   * 4. Update DB record
   * 5. Audit log
   */
  async processUpload(uploadToken, file, notes) {
    const request = await this.validateUploadToken(uploadToken);
    if (!request) {
      throw new AppError('Invalid or expired upload link', 400);
    }

    const monthStr = String(request.period_month).padStart(2, '0');
    const periodStr = `${request.period_year}-${monthStr}`;
    const baseFolderPath = process.env.SHAREPOINT_FOLDER_PATH || 'Trading Statements';
    const folderPath = `${baseFolderPath}/${periodStr}`;

    // Build filename: email_timestamp_originalname
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const emailPrefix = request.employee_email.split('@')[0];
    const uploadFilename = `${emailPrefix}_${timestamp}_${file.originalname}`;

    let sharepointResult;
    try {
      sharepointResult = await GraphAPIService.uploadToSharePoint(
        file.buffer,
        uploadFilename,
        folderPath
      );
    } catch (error) {
      logger.error(`SharePoint upload failed for ${request.employee_email}:`, error.message);
      await AuditLog.logActivity(
        request.employee_email, 'employee', 'statement_sharepoint_upload_failed',
        'statement_request', request.uuid,
        `SharePoint upload failed: ${error.message}`
      );
      throw new AppError('Failed to upload file to SharePoint. Please try again.', 502);
    }

    // Update DB record
    await StatementRequest.markUploaded(request.uuid, {
      itemId: sharepointResult.itemId,
      webUrl: sharepointResult.webUrl,
      originalFilename: file.originalname,
      fileSize: file.size,
      contentType: file.mimetype,
      notes: notes || null
    });

    await AuditLog.logActivity(
      request.employee_email, 'employee', 'statement_uploaded',
      'statement_request', request.uuid,
      `Uploaded ${file.originalname} (${file.size} bytes) for ${periodStr}`
    );

    const monthName = new Date(request.period_year, request.period_month - 1)
      .toLocaleString('en-US', { month: 'long' });

    return {
      period: `${monthName} ${request.period_year}`,
      originalFilename: file.originalname,
      sharepointUrl: sharepointResult.webUrl
    };
  }

  /**
   * Get dashboard data for the admin statement view.
   */
  async getAdminDashboardData(year, month) {
    const summary = await StatementRequest.getPeriodSummary(year, month);
    const requests = await StatementRequest.getByPeriod(year, month);
    const availablePeriods = await StatementRequest.getAvailablePeriods();
    return { summary, requests, availablePeriods };
  }

  /**
   * Batch mark overdue requests (past deadline, still pending).
   */
  async markOverdueRequests() {
    const overdue = await StatementRequest.markOverdue();
    if (overdue && overdue.length > 0) {
      logger.info(`Marked ${overdue.length} statement requests as overdue`);
    }
    return overdue || [];
  }

  /**
   * Send daily reminder emails for all pending/overdue requests that haven't been uploaded.
   * No cap on reminder count — sends daily until the employee uploads.
   */
  async sendReminders() {
    const pendingRequests = await StatementRequest.getPendingForReminders();
    let sent = 0;

    for (const request of pendingRequests) {
      try {
        const period = { year: request.period_year, month: request.period_month };
        await this.sendReminderEmail(
          { email: request.employee_email, name: request.employee_name },
          request.upload_token,
          period
        );
        await StatementRequest.incrementReminderCount(request.uuid);
        sent++;

        // Small delay between emails
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error(`Failed to send reminder to ${request.employee_email}:`, error.message);
      }
    }

    if (sent > 0) {
      logger.info(`Sent ${sent} statement reminder emails`);
    }
    return sent;
  }

  /**
   * Send a reminder email (distinct subject from initial request).
   */
  async sendReminderEmail(employee, uploadToken, period) {
    const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const uploadUrl = `${frontendUrl}/upload-statement/${uploadToken}`;

    const monthName = new Date(period.year, period.month - 1).toLocaleString('en-US', { month: 'long' });
    const subject = `Reminder: Trading Statement Required — ${monthName} ${period.year}`;

    const htmlBody = this.generateEmailBody(
      employee.name || employee.email,
      uploadUrl,
      { ...period, monthName },
      new Date() // deadline already set in DB
    );

    try {
      await GraphAPIService.sendEmail(employee.email, subject, htmlBody);

      await AuditLog.logActivity(
        'system', 'admin', 'statement_reminder_sent',
        'statement_request', null,
        `Reminder email sent to ${employee.email} for ${monthName} ${period.year}`
      );
    } catch (error) {
      logger.error(`Failed to send reminder email to ${employee.email}:`, error.message);
      throw error;
    }
  }
}

module.exports = new StatementRequestService();
