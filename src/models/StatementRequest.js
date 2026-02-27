const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class StatementRequest extends BaseModel {
  static get tableName() {
    return 'statement_requests';
  }

  /**
   * Create a new statement request record for a period + employee.
   * Generates a unique upload token and calculates deadline.
   * Uses ON CONFLICT DO NOTHING to skip duplicates.
   */
  static async createRequest(data) {
    const uuid = uuidv4();
    const uploadToken = crypto.randomBytes(32).toString('hex');
    const deadlineDays = parseInt(process.env.STATEMENT_UPLOAD_DEADLINE_DAYS) || 14;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deadlineDays);

    const sql = `
      INSERT INTO statement_requests (
        uuid, period_year, period_month, employee_email, employee_name,
        status, upload_token, deadline_at, email_sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (period_year, period_month, employee_email) DO NOTHING
      RETURNING *
    `;
    const params = [
      uuid,
      data.period_year,
      data.period_month,
      data.employee_email.toLowerCase(),
      data.employee_name || null,
      'pending',
      uploadToken,
      deadline.toISOString(),
      new Date().toISOString()
    ];

    const rows = await this.query(sql, params);
    if (rows && rows.length > 0) {
      return rows[0];
    }
    // Conflict — record already exists for this period+employee
    return null;
  }

  /**
   * Find a statement request by its upload token.
   * Used by the upload page to validate the link.
   */
  static async findByUploadToken(token) {
    if (!token || typeof token !== 'string') return null;
    const sql = `SELECT * FROM statement_requests WHERE upload_token = $1 LIMIT 1`;
    return await this.get(sql, [token]);
  }

  /**
   * Mark a statement request as uploaded with SharePoint file details.
   */
  static async markUploaded(uuid, sharepointData) {
    const sql = `
      UPDATE statement_requests SET
        status = 'uploaded',
        uploaded_at = $2,
        sharepoint_item_id = $3,
        sharepoint_file_url = $4,
        original_filename = $5,
        file_size_bytes = $6,
        file_content_type = $7,
        notes = COALESCE($8, notes),
        updated_at = $9
      WHERE uuid = $1
      RETURNING *
    `;
    const now = new Date().toISOString();
    const params = [
      uuid,
      now,
      sharepointData.itemId || null,
      sharepointData.webUrl || null,
      sharepointData.originalFilename || null,
      sharepointData.fileSize || null,
      sharepointData.contentType || null,
      sharepointData.notes || null,
      now
    ];
    const rows = await this.query(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all statement requests for a specific period, ordered by status then email.
   */
  static async getByPeriod(year, month) {
    const sql = `
      SELECT * FROM statement_requests
      WHERE period_year = $1 AND period_month = $2
      ORDER BY
        CASE status
          WHEN 'overdue' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'uploaded' THEN 3
          WHEN 'skipped' THEN 4
        END,
        employee_email ASC
    `;
    return await this.query(sql, [year, month]);
  }

  /**
   * Get aggregate counts by status for a period.
   */
  static async getPeriodSummary(year, month) {
    const sql = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'uploaded') as uploaded,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL) as emails_sent
      FROM statement_requests
      WHERE period_year = $1 AND period_month = $2
    `;
    return await this.get(sql, [year, month]);
  }

  /**
   * Get all pending requests past their deadline.
   */
  static async getOverdueRequests() {
    const sql = `
      SELECT * FROM statement_requests
      WHERE status = 'pending' AND deadline_at < NOW()
    `;
    return await this.query(sql, []);
  }

  /**
   * Batch mark overdue requests.
   */
  static async markOverdue() {
    const sql = `
      UPDATE statement_requests
      SET status = 'overdue', updated_at = NOW()
      WHERE status = 'pending' AND deadline_at < NOW()
      RETURNING uuid, employee_email
    `;
    return await this.query(sql, []);
  }

  /**
   * Update the email message ID after a successful Graph API send.
   */
  static async updateEmailMessageId(uuid, messageId) {
    const sql = `
      UPDATE statement_requests
      SET email_message_id = $2, updated_at = NOW()
      WHERE uuid = $1
    `;
    return await this.run(sql, [uuid, messageId]);
  }

  /**
   * Increment the reminder count and update the last reminder timestamp.
   */
  static async incrementReminderCount(uuid) {
    const sql = `
      UPDATE statement_requests
      SET reminder_count = reminder_count + 1,
          last_reminder_at = NOW(),
          updated_at = NOW()
      WHERE uuid = $1
    `;
    return await this.run(sql, [uuid]);
  }

  /**
   * Get distinct periods that have statement requests, for admin dropdown.
   */
  static async getAvailablePeriods() {
    const sql = `
      SELECT DISTINCT period_year, period_month
      FROM statement_requests
      ORDER BY period_year DESC, period_month DESC
      LIMIT 24
    `;
    return await this.query(sql, []);
  }

  /**
   * Find a specific request by UUID.
   */
  static async findByUuid(uuid) {
    if (!uuid) return null;
    const sql = `SELECT * FROM statement_requests WHERE uuid = $1 LIMIT 1`;
    return await this.get(sql, [uuid]);
  }

  /**
   * Get all pending/overdue statement requests for a specific employee.
   * Used by the employee dashboard to show upload links.
   */
  static async getByEmployee(email) {
    if (!email) return [];
    const sql = `
      SELECT * FROM statement_requests
      WHERE employee_email = $1
      ORDER BY
        CASE status
          WHEN 'overdue' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'uploaded' THEN 3
          WHEN 'skipped' THEN 4
        END,
        period_year DESC, period_month DESC
    `;
    return await this.query(sql, [email.toLowerCase()]);
  }

  /**
   * Get all pending/overdue requests that need reminder emails.
   * Returns requests where email was sent but statement not yet uploaded.
   */
  static async getPendingForReminders() {
    const sql = `
      SELECT * FROM statement_requests
      WHERE status IN ('pending', 'overdue')
        AND email_sent_at IS NOT NULL
        AND uploaded_at IS NULL
      ORDER BY deadline_at ASC
    `;
    return await this.query(sql, []);
  }
}

module.exports = StatementRequest;
