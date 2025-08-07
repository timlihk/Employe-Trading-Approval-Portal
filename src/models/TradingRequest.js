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
        trading_type,
        estimated_value, // For server-side simple requests
      } = requestData;
      
      // Handle both old complex format and new simple format
      const finalSharePrice = share_price || (estimated_value ? (estimated_value / shares) : null);
      const finalTotalValue = total_value || estimated_value;
      
      const sql = `
        INSERT INTO trading_requests (
          employee_email, stock_name, ticker, shares, 
          share_price, total_value, currency, share_price_usd, 
          total_value_usd, exchange_rate, trading_type, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', 'utc'))
      `;
      
      const params = [
        employee_email.toLowerCase(), stock_name, ticker, shares, 
        finalSharePrice, finalTotalValue, currency, share_price_usd || finalSharePrice,
        total_value_usd || finalTotalValue, exchange_rate || 1, trading_type
      ];
      
      database.run(sql, params).then(result => {
        resolve({ 
          id: result.lastID,
          status: 'pending',
          ...requestData 
        });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static updateStatus(id, status, rejection_reason = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trading_requests 
        SET status = ?, rejection_reason = ?, processed_at = datetime('now', 'utc')
        WHERE id = ?
      `;
      
      database.run(sql, [status, rejection_reason, id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests WHERE id = ?';
      
      database.get(sql, [id]).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getAll() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests ORDER BY created_at ASC';
      
      database.query(sql, []).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests WHERE LOWER(employee_email) = ? ORDER BY created_at ASC';
      
      database.query(sql, [email.toLowerCase()]).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static escalate(id, escalationReason) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trading_requests 
        SET escalated = 1, escalation_reason = ?, escalated_at = datetime('now', 'utc'), status = 'pending'
        WHERE id = ?
      `;
      
      database.run(sql, [escalationReason, id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getUniqueTeamMembers() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT DISTINCT LOWER(employee_email) as employee_email FROM trading_requests ORDER BY employee_email';
      
      database.query(sql, []).then(rows => {
        resolve(rows.map(row => row.employee_email));
      }).catch(err => {
        reject(err);
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

      if (filters.ticker) {
        sql += ' AND UPPER(ticker) = ?';
        params.push(filters.ticker.toUpperCase());
      }

      if (filters.trading_type) {
        sql += ' AND LOWER(trading_type) = ?';
        params.push(filters.trading_type.toLowerCase());
      }

      sql += ' ORDER BY created_at DESC';

      database.query(sql, params).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
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

      database.get(sql, params).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = TradingRequest;