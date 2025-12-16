const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class TradingRequest extends BaseModel {
  static get tableName() {
    return 'trading_requests';
  }
  static async create(requestData) {
    try {
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
        instrument_type = 'equity', // Default to equity if not specified
      } = requestData;
      
      // Generate UUID for the new trading request
      const uuid = uuidv4();
      
      // Handle both old complex format and new simple format
      const finalSharePrice = share_price || (estimated_value ? (estimated_value / shares) : null);
      const finalTotalValue = total_value || estimated_value;
      
      // UUID-only: No need for numeric ID
      const sql = `
        INSERT INTO trading_requests (
          uuid, employee_email, stock_name, ticker, shares, 
          share_price, total_value, currency, share_price_usd, 
          total_value_usd, exchange_rate, trading_type, status, 
          rejection_reason, processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING uuid
      `;
      
      const params = [
        uuid,
        employee_email.toLowerCase(), stock_name, ticker, shares, 
        finalSharePrice, finalTotalValue, currency, share_price_usd || finalSharePrice,
        total_value_usd || finalTotalValue, exchange_rate || 1, trading_type,
        requestData.status || 'pending',
        requestData.rejection_reason || null,
        requestData.processed_at || new Date().toISOString()
      ];
      
      // Use query() instead of run() to avoid double RETURNING clause
      const result = await this.query(sql, params);
      
      // PostgreSQL returns array of rows, get the first one
      const insertedRow = Array.isArray(result) ? result[0] : result.rows?.[0];
      
      if (!insertedRow) {
        throw new Error('Failed to create trading request - no result returned');
      }
      
      return { 
        uuid: insertedRow.uuid,
        ...requestData 
      };
      
    } catch (error) {
      console.error('TradingRequest.create error:', {
        message: error.message,
        params: params?.length,
        sqlLength: sql?.length
      });
      throw error;
    }
  }

  static updateStatus(uuid, status, rejection_reason = null) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trading_requests 
        SET status = $1, rejection_reason = $2, processed_at = CURRENT_TIMESTAMP
        WHERE uuid = $3
      `;
      
      this.run(sql, [status, rejection_reason, uuid]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getByUuid(uuid) {
    return this.findOne({ uuid: uuid });
  }
  
  // Simplified: Only use UUID as primary identifier
  static getById(uuid) {
    return this.getByUuid(uuid);
  }

  static escalate(uuid, escalationReason, status = 'pending') {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE trading_requests
        SET escalated = true, escalation_reason = $1, escalated_at = CURRENT_TIMESTAMP, status = $3
        WHERE uuid = $2
      `;

      this.run(sql, [escalationReason, uuid, status]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getAll(sortBy = 'created_at', sortOrder = 'DESC') {
    const validSortColumns = ['created_at', 'ticker', 'employee_email'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
    
    return this.findAll({}, `${sortColumn} ${sortDirection}`);
  }

  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM trading_requests WHERE LOWER(employee_email) = $1 ORDER BY created_at DESC';
      
      this.query(sql, [email.toLowerCase()]).then(rows => {
        resolve(rows);
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
      // Build filter clauses using helper
      const { whereClause, params, paramIndex } = this._buildFilterClauses(filters);

      // Build sort clause using helper
      const sortClause = this._buildSortClause(sortBy, sortOrder);

      // Construct full SQL
      let sql = `SELECT * FROM trading_requests WHERE 1=1${whereClause}${sortClause}`;

      // Check if pagination is requested
      if (filters.page !== undefined && filters.limit !== undefined) {
        // Paginated response - build count query without ORDER BY
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/ ORDER BY .+$/, '');
        const page = filters.page || 1;
        const limit = filters.limit || 25;
        const offset = (page - 1) * limit;

        sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const finalParams = [...params, limit, offset];

        Promise.all([
          this.query(countSql, params), // Count uses original params (no LIMIT/OFFSET)
          this.query(sql, finalParams)  // Results with LIMIT/OFFSET
        ]).then(([countResult, rows]) => {
          const total = parseInt(countResult[0]?.total || 0, 10);
          resolve({
            data: rows,
            pagination: {
              total: total,
              page: parseInt(page, 10),
              limit: parseInt(limit, 10),
              pages: Math.ceil(total / limit)
            }
          });
        }).catch(err => {
          reject(err);
        });
      } else {
        // Non-paginated response (for exports)
        this.query(sql, params).then(rows => {
          resolve({
            data: rows,
            pagination: {
              total: rows.length,
              page: 1,
              limit: rows.length,
              pages: 1
            }
          });
        }).catch(err => {
          reject(err);
        });
      }
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
      // Build filter clauses using helper
      const { whereClause, params } = this._buildFilterClauses(filters);

      const sql = `
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
        WHERE 1=1${whereClause}
      `;

      this.get(sql, params).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }

  // Helper method to build WHERE clause for filtered queries
  static _buildFilterClauses(filters, initialParamIndex = 1) {
    let whereClause = '';
    const params = [];
    let paramIndex = initialParamIndex;

    if (filters.employee_email) {
      whereClause += ` AND LOWER(employee_email) = $${paramIndex}`;
      params.push(filters.employee_email.toLowerCase());
      paramIndex++;
    }

    if (filters.start_date) {
      // Convert to Hong Kong timezone (UTC+8) for date comparison
      whereClause += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`;
      params.push(filters.start_date);
      paramIndex++;
    }

    if (filters.end_date) {
      whereClause += ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`;
      params.push(filters.end_date);
      paramIndex++;
    }

    if (filters.ticker) {
      whereClause += ` AND UPPER(ticker) = $${paramIndex}`;
      params.push(filters.ticker.toUpperCase());
      paramIndex++;
    }

    if (filters.trading_type) {
      whereClause += ` AND LOWER(trading_type) = $${paramIndex}`;
      params.push(filters.trading_type.toLowerCase());
      paramIndex++;
    }

    if (filters.status) {
      whereClause += ` AND LOWER(status) = $${paramIndex}`;
      params.push(filters.status.toLowerCase());
      paramIndex++;
    }

    if (filters.escalated !== undefined) {
      whereClause += ` AND escalated = $${paramIndex}`;
      params.push(filters.escalated);
      paramIndex++;
    }

    if (filters.instrument_type) {
      whereClause += ` AND LOWER(instrument_type) = $${paramIndex}`;
      params.push(filters.instrument_type.toLowerCase());
      paramIndex++;
    }

    return { whereClause, params, paramIndex };
  }

  // Helper method to build ORDER BY clause
  static _buildSortClause(sortBy, sortOrder) {
    const validSortColumns = ['id', 'created_at', 'ticker', 'employee_email', 'total_value_usd'];
    const validSortOrders = ['ASC', 'DESC'];

    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'id';
    const sortDirection = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    return ` ORDER BY ${sortColumn} ${sortDirection}`;
  }
}

module.exports = TradingRequest;