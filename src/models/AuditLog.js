const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class AuditLog extends BaseModel {
  static get tableName() {
    return 'audit_logs';
  }
  static logActivity(userEmail, userType, action, targetType, targetId = null, details = null, ipAddress = null, userAgent = null, sessionId = null, client = null) {
    return new Promise((resolve, reject) => {
      const uuid = uuidv4();

      const sql = `
        INSERT INTO audit_logs (
          uuid, user_email, user_type, action, target_type, target_id,
          details, ip_address, user_agent, session_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING uuid
      `;

      const params = [
        uuid,
        userEmail.toLowerCase(),
        userType,
        action,
        targetType,
        targetId,
        details,
        ipAddress,
        userAgent,
        sessionId
      ];

      this.query(sql, params, client).then(result => {
        const insertedRow = Array.isArray(result) ? result[0] : result.rows?.[0];
        resolve(insertedRow?.uuid || uuid);
      }).catch(reject);
    });
  }

  static getAuditLogs(filters = {}) {
    return new Promise((resolve, reject) => {
      // Build conditions using helper
      const { conditions, params, paramIndex } = this._buildAuditConditions(filters);

      let query = 'SELECT * FROM audit_logs';
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY created_at DESC';

      // Check if pagination is requested
      if (filters.page !== undefined && filters.limit !== undefined) {
        // Paginated response - build count query without ORDER BY
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/ ORDER BY .+$/, '');
        const page = filters.page || 1;
        const limit = filters.limit || 50;
        const offset = (page - 1) * limit;

        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        const finalParams = [...params, limit, offset];

        Promise.all([
          this.query(countQuery, params), // Count uses original params (no LIMIT/OFFSET)
          this.query(query, finalParams)  // Results with LIMIT/OFFSET
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
        // Non-paginated response (for exports or legacy usage)
        if (filters.limit) {
          query += ` LIMIT $${paramIndex}`;
          params.push(filters.limit);
        }

        this.query(query, params).then(rows => {
          // Return consistent format for backward compatibility
          if (Array.isArray(rows)) {
            resolve(rows);
          } else {
            resolve({
              data: rows,
              pagination: {
                total: rows.length,
                page: 1,
                limit: rows.length,
                pages: 1
              }
            });
          }
        }).catch(reject);
      }
    });
  }

  static getAuditSummary(filters = {}) {
    return new Promise((resolve, reject) => {
      // Build conditions using helper
      const { conditions, params } = this._buildAuditConditions(filters);

      let query = `
        SELECT
          COUNT(*) as total_activities,
          COUNT(DISTINCT user_email) as unique_users,
          COUNT(CASE WHEN user_type = 'admin' THEN 1 END) as admin_activities,
          COUNT(CASE WHEN user_type = 'employee' THEN 1 END) as employee_activities,
          COUNT(CASE WHEN action LIKE '%login%' THEN 1 END) as login_activities,
          COUNT(CASE WHEN action LIKE '%create%' THEN 1 END) as create_activities,
          COUNT(CASE WHEN action LIKE '%update%' THEN 1 END) as update_activities,
          COUNT(CASE WHEN action LIKE '%delete%' THEN 1 END) as delete_activities
        FROM audit_logs
      `;

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      this.get(query, params).then(resolve).catch(reject);
    });
  }

  static cleanupOldLogs(retentionDays) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const query = 'DELETE FROM audit_logs WHERE created_at < $1';
      
      this.run(query, [cutoffDate.toISOString()]).then(result => {
        resolve(result.changes);
      }).catch(reject);
    });
  }

  static getActivityByUser(userEmail, limit = 50) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM audit_logs
        WHERE user_email = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;

      this.query(query, [userEmail.toLowerCase(), limit]).then(resolve).catch(reject);
    });
  }

  static getRecentActivity(hours = 24, limit = 100) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hours);
      
      const query = `
        SELECT * FROM audit_logs 
        WHERE created_at >= $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      this.query(query, [cutoffDate.toISOString(), limit]).then(resolve).catch(reject);
    });
  }

  // Helper method to build WHERE conditions for audit log queries
  static _buildAuditConditions(filters, initialParamIndex = 1) {
    const conditions = [];
    const params = [];
    let paramIndex = initialParamIndex;

    const addCondition = (field, value, operator = '=', transform = null) => {
      if (value !== undefined && value !== null && value !== '') {
        const conditionValue = transform ? transform(value) : value;
        conditions.push(`${field} ${operator} $${paramIndex}`);
        params.push(conditionValue);
        paramIndex++;
      }
    };

    addCondition('user_email', filters.userEmail, '=', (v) => v.toLowerCase());
    addCondition('user_type', filters.userType);
    addCondition('action', filters.action);
    addCondition('target_type', filters.targetType);

    // Sargable date filtering: convert date to HKT timestamp range
    if (filters.startDate) {
      conditions.push(`created_at >= ($${paramIndex}::date AT TIME ZONE 'Asia/Hong_Kong')`);
      params.push(filters.startDate);
      paramIndex++;
    }
    if (filters.endDate) {
      conditions.push(`created_at < (($${paramIndex}::date + interval '1 day') AT TIME ZONE 'Asia/Hong_Kong')`);
      params.push(filters.endDate);
      paramIndex++;
    }

    return { conditions, params, paramIndex };
  }
}

module.exports = AuditLog;