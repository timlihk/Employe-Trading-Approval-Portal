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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      database.run(sql, [
        ticker, company_name, action, admin_email, reason,
        ip_address, user_agent, session_id
      ]).then(result => {
        resolve({ id: result.lastID, ...changeData });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM restricted_stock_changelog ORDER BY created_at DESC';
      
      database.query(sql, []).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
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
        sql += ` AND DATE(created_at) >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        sql += ` AND DATE(created_at) <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      sql += ' ORDER BY created_at DESC';

      database.query(sql, params).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
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
      let paramIndex = 1;

      if (filters.start_date) {
        sql += ` AND DATE(created_at) >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        sql += ` AND DATE(created_at) <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      database.get(sql, params).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = RestrictedStockChangelog;