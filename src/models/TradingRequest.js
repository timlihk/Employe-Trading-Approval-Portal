const database = require('./database');

class TradingRequest {
  static create(requestData) {
    return new Promise((resolve, reject) => {
      const { 
        employee_email, 
        stock_name, 
        ticker, 
        shares, 
        share_price, 
        total_value, 
        currency = 'USD',
        share_price_usd,
        total_value_usd,
        exchange_rate,
        trading_type 
      } = requestData;
      
      const sql = `
        INSERT INTO trading_requests (
          employee_email, stock_name, ticker, shares, 
          share_price, total_value, currency, share_price_usd, 
          total_value_usd, exchange_rate, trading_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      database.getDb().run(sql, [
        employee_email.toLowerCase(), stock_name, ticker, shares, 
        share_price, total_value, currency, share_price_usd,
        total_value_usd, exchange_rate, trading_type
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...requestData });
        }
      });
    });
  }

  static updateStatus(id, status, rejection_reason = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trading_requests 
        SET status = ?, rejection_reason = ?, processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      database.getDb().run(sql, [status, rejection_reason, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  static getById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests WHERE id = ?';
      
      database.getDb().get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests ORDER BY created_at ASC';
      
      database.getDb().all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static getUniqueTeamMembers() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT DISTINCT LOWER(employee_email) as employee_email FROM trading_requests ORDER BY employee_email';
      
      database.getDb().all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.employee_email));
        }
      });
    });
  }

  static getFilteredHistory(filters) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM trading_requests WHERE 1=1';
      const params = [];

      if (filters.employee_email) {
        sql += ' AND LOWER(employee_email) = ?';
        params.push(filters.employee_email.toLowerCase());
      }

      if (filters.start_date) {
        sql += ' AND DATE(created_at) >= ?';
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        sql += ' AND DATE(created_at) <= ?';
        params.push(filters.end_date);
      }

      sql += ' ORDER BY created_at ASC';

      database.getDb().all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static getHistorySummary(filters) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN trading_type = 'buy' THEN shares ELSE 0 END) as total_buy_shares,
          SUM(CASE WHEN trading_type = 'sell' THEN shares ELSE 0 END) as total_sell_shares,
          SUM(CASE WHEN trading_type = 'buy' AND total_value IS NOT NULL THEN total_value ELSE 0 END) as total_buy_value,
          SUM(CASE WHEN trading_type = 'sell' AND total_value IS NOT NULL THEN total_value ELSE 0 END) as total_sell_value,
          COUNT(DISTINCT employee_email) as unique_employees,
          COUNT(DISTINCT ticker) as unique_stocks
        FROM trading_requests 
        WHERE 1=1
      `;
      const params = [];

      if (filters.employee_email) {
        sql += ' AND LOWER(employee_email) = ?';
        params.push(filters.employee_email.toLowerCase());
      }

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

module.exports = TradingRequest;