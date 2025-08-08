const BaseModel = require('./BaseModel');

class TradingRequest extends BaseModel {
  static get tableName() {
    return 'trading_requests';
  }
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', CURRENT_TIMESTAMP)
      `;
      
      const params = [
        employee_email.toLowerCase(), stock_name, ticker, shares, 
        finalSharePrice, finalTotalValue, currency, share_price_usd || finalSharePrice,
        total_value_usd || finalTotalValue, exchange_rate || 1, trading_type
      ];
      
      this.run(sql, params).then(result => {
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
        SET status = $1, rejection_reason = $2, processed_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `;
      
      this.run(sql, [status, rejection_reason, id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getById(id) {
    return this.findById(id);
  }

  static getAll(sortBy = 'id', sortOrder = 'DESC') {
    const validSortColumns = ['id', 'created_at', 'ticker', 'employee_email'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    return this.findAll({}, `${sortColumn} ${sortDirection}`);
  }

  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests WHERE LOWER(employee_email) = $1 ORDER BY id DESC';
      
      this.query(sql, [email.toLowerCase()]).then(rows => {
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
        SET escalated = true, escalation_reason = $1, escalated_at = CURRENT_TIMESTAMP, status = 'pending'
        WHERE id = $2
      `;
      
      this.run(sql, [escalationReason, id]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getUniqueTeamMembers() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT DISTINCT LOWER(employee_email) as employee_email FROM trading_requests ORDER BY employee_email';
      
      this.query(sql, []).then(rows => {
        resolve(rows.map(row => row.employee_email));
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getFilteredHistory(filters, sortBy = 'id', sortOrder = 'DESC') {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM trading_requests WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (filters.employee_email) {
        sql += ` AND LOWER(employee_email) = $${paramIndex}`;
        params.push(filters.employee_email.toLowerCase());
        paramIndex++;
      }

      if (filters.start_date) {
        // Convert to Hong Kong timezone (UTC+8) for date comparison
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        // Convert to Hong Kong timezone (UTC+8) for date comparison
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      if (filters.ticker) {
        sql += ` AND UPPER(ticker) = $${paramIndex}`;
        params.push(filters.ticker.toUpperCase());
        paramIndex++;
      }

      if (filters.trading_type) {
        sql += ` AND LOWER(trading_type) = $${paramIndex}`;
        params.push(filters.trading_type.toLowerCase());
        paramIndex++;
      }

      // Add dynamic sorting
      const validSortColumns = ['id', 'created_at', 'ticker', 'employee_email'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
      const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      sql += ` ORDER BY ${sortColumn} ${sortDirection}`;

      this.query(sql, params).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getPendingRequests(sortBy = 'id', sortOrder = 'DESC') {
    return new Promise((resolve, reject) => {
      const validSortColumns = ['id', 'created_at', 'ticker'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
      const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      const sql = `SELECT * FROM trading_requests WHERE status = $1 ORDER BY ${sortColumn} ${sortDirection}`;
      this.query(sql, ['pending']).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getEscalatedRequests(sortBy = 'id', sortOrder = 'DESC') {
    return new Promise((resolve, reject) => {
      const validSortColumns = ['id', 'created_at', 'ticker'];
      const validSortOrders = ['ASC', 'DESC'];
      
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
      const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
      
      const sql = `SELECT * FROM trading_requests WHERE escalated = $1 AND status = $2 ORDER BY ${sortColumn} ${sortDirection}`;
      this.query(sql, [true, 'pending']).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getTotalCount() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM trading_requests';
      this.get(sql, []).then(row => {
        resolve(row.count);
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
      let paramIndex = 1;

      if (filters.employee_email) {
        sql += ` AND LOWER(employee_email) = $${paramIndex}`;
        params.push(filters.employee_email.toLowerCase());
        paramIndex++;
      }

      if (filters.start_date) {
        // Convert to Hong Kong timezone (UTC+8) for date comparison
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }

      if (filters.end_date) {
        // Convert to Hong Kong timezone (UTC+8) for date comparison
        sql += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }

      this.get(sql, params).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = TradingRequest;