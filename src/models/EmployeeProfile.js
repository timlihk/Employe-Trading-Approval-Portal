const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class EmployeeProfile extends BaseModel {
  static get tableName() {
    return 'employee_profiles';
  }

  /**
   * Get profile by employee email.
   * Returns null if no profile exists yet.
   */
  static async getByEmail(email) {
    if (!email) return null;
    const sql = `SELECT * FROM employee_profiles WHERE employee_email = $1 LIMIT 1`;
    return await this.get(sql, [email.toLowerCase()]);
  }

  /**
   * Check if the employee's accounts confirmation is current (within 30 days).
   */
  static async isConfirmationCurrent(email) {
    if (!email) return false;
    const sql = `
      SELECT accounts_confirmed_at > NOW() - INTERVAL '30 days' AS is_current
      FROM employee_profiles
      WHERE employee_email = $1
      LIMIT 1
    `;
    const result = await this.get(sql, [email.toLowerCase()]);
    return result?.is_current || false;
  }

  /**
   * Record account confirmation (upsert).
   */
  static async confirmAccounts(email) {
    const uuid = uuidv4();
    const sql = `
      INSERT INTO employee_profiles (uuid, employee_email, accounts_confirmed_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (employee_email)
      DO UPDATE SET accounts_confirmed_at = NOW(), updated_at = NOW()
      RETURNING *
    `;
    const rows = await this.query(sql, [uuid, email.toLowerCase()]);
    return rows && rows.length > 0 ? rows[0] : null;
  }
}

module.exports = EmployeeProfile;
