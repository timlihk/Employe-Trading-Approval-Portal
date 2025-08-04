const database = require('./database');

class RestrictedStockChangelog {
  static logChange(changeData) {
    return new Promise((resolve, reject) => {
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
      
      const sql = `
        INSERT INTO restricted_stock_changelog (
          ticker, company_name, action, admin_email, reason,
          ip_address, user_agent, session_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      database.getDb().run(sql, [
        ticker, company_name, action, admin_email, reason,
        ip_address, user_agent, session_id
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...changeData });
        }
      });
    });
  }

  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stock_changelog ORDER BY created_at DESC';
      
      database.getDb().all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static getFiltered(filters) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM restricted_stock_changelog WHERE 1=1';
      const params = [];

      if (filters.ticker) {
        sql += ' AND ticker = ?';
        params.push(filters.ticker);
      }

      if (filters.action) {
        sql += ' AND action = ?';
        params.push(filters.action);
      }

      if (filters.admin_email) {
        sql += ' AND admin_email = ?';
        params.push(filters.admin_email);
      }

      if (filters.start_date) {
        sql += ' AND DATE(created_at) >= ?';
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        sql += ' AND DATE(created_at) <= ?';
        params.push(filters.end_date);
      }

      sql += ' ORDER BY created_at DESC';

      database.getDb().all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
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

      if (filters.start_date) {
        sql += ' AND DATE(created_at) >= ?';
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        sql += ' AND DATE(created_at) <= ?';
        params.push(filters.end_date);
      }

      database.getDb().get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
}

module.exports = RestrictedStockChangelog;