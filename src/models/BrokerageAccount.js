const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class BrokerageAccount extends BaseModel {
  static get tableName() {
    return 'brokerage_accounts';
  }

  /**
   * Get all brokerage accounts for a specific employee.
   */
  static async getByEmployee(email) {
    if (!email) return [];
    const sql = `
      SELECT * FROM brokerage_accounts
      WHERE employee_email = $1
      ORDER BY firm_name ASC, account_number ASC
    `;
    return await this.query(sql, [email.toLowerCase()]);
  }

  /**
   * Find a specific account by UUID.
   */
  static async findByUuid(uuid) {
    if (!uuid) return null;
    const sql = `SELECT * FROM brokerage_accounts WHERE uuid = $1 LIMIT 1`;
    return await this.get(sql, [uuid]);
  }

  /**
   * Create a new brokerage account.
   */
  static async create(data) {
    const uuid = uuidv4();
    const sql = `
      INSERT INTO brokerage_accounts (uuid, employee_email, firm_name, account_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (employee_email, firm_name, account_number) DO NOTHING
      RETURNING *
    `;
    const rows = await this.query(sql, [
      uuid,
      data.employee_email.toLowerCase(),
      data.firm_name.trim(),
      data.account_number.trim()
    ]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Update an existing brokerage account.
   * Includes email check to prevent cross-employee updates.
   */
  static async update(uuid, email, data) {
    const sql = `
      UPDATE brokerage_accounts
      SET firm_name = $3, account_number = $4, updated_at = NOW()
      WHERE uuid = $1 AND employee_email = $2
      RETURNING *
    `;
    const rows = await this.query(sql, [
      uuid,
      email.toLowerCase(),
      data.firm_name.trim(),
      data.account_number.trim()
    ]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Delete a brokerage account.
   * Includes email check to prevent cross-employee deletion.
   */
  static async delete(uuid, email) {
    const sql = `
      DELETE FROM brokerage_accounts
      WHERE uuid = $1 AND employee_email = $2
      RETURNING uuid
    `;
    const rows = await this.query(sql, [uuid, email.toLowerCase()]);
    return rows && rows.length > 0;
  }
}

module.exports = BrokerageAccount;
