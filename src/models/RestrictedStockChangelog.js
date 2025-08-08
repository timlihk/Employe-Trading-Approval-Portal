const BaseModel = require('./BaseModel');

class RestrictedStockChangelog extends BaseModel {
  static get tableName() {
    return 'restricted_stock_changelog';
  }
  static logChange(changeData) {
    const {
      ticker,
      company_name,
      action,
      admin_email,
      reason = null,
      ip_address = null,
      user_agent = null,
      session_id = null
    } = changeData;
    
    return this.create({
      ticker,
      company_name,
      action,
      admin_email,
      reason,
      ip_address,
      user_agent,
      session_id
    });
  }

  static getAll() {
    return this.findAll({}, 'created_at DESC');
  }

  static getRecentChanges(limit = 20) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1`;
      this.query(sql, [limit]).then(resolve).catch(reject);
    });
  }

  static getFiltered(filters) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM restricted_stock_changelog WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (filters.ticker) {
        sql += ` AND ticker = $${paramIndex}`;
        params.push(filters.ticker);
        paramIndex++;
      }

      if (filters.action) {
        sql += ` AND action = $${paramIndex}`;
        params.push(filters.action);
        paramIndex++;
      }

      if (filters.admin_email) {
        sql += ` AND admin_email = $${paramIndex}`;
        params.push(filters.admin_email);
        paramIndex++;
      }

      if (filters.start_date) {
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      sql += ' ORDER BY created_at DESC';

      this.query(sql, params).then(resolve).catch(reject);
    });
  }

  static getSummary(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_changes,
          SUM(CASE WHEN action = 'added' THEN 1 ELSE 0 END) as total_added,
          SUM(CASE WHEN action = 'removed' THEN 1 ELSE 0 END) as total_removed,
          COUNT(DISTINCT ticker) as unique_stocks_affected,
          COUNT(DISTINCT admin_email) as unique_admins
        FROM restricted_stock_changelog 
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (filters.start_date) {
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      this.get(sql, params).then(resolve).catch(reject);
    });
  }
}

module.exports = RestrictedStockChangelog;