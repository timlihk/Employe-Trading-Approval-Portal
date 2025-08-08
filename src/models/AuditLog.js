const BaseModel = require('./BaseModel');

class AuditLog extends BaseModel {
  static get tableName() {
    return 'audit_logs';
  }
  static logActivity(userEmail, userType, action, targetType, targetId = null, details = null, ipAddress = null, userAgent = null, sessionId = null) {
    return new Promise((resolve, reject) => {
      this.create({
        user_email: userEmail.toLowerCase(),
        user_type: userType,
        action,
        target_type: targetType,
        target_id: targetId,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: sessionId
      }).then(result => {
        resolve(result.id);
      }).catch(reject);
    });
  }

  static getAuditLogs(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM audit_logs';
      let params = [];
      let conditions = [];
      let paramIndex = 1;

      if (filters.userEmail) {
        conditions.push(`LOWER(user_email) = $${paramIndex}`);
        params.push(filters.userEmail.toLowerCase());
        paramIndex++;
      }

      if (filters.userType) {
        conditions.push(`user_type = $${paramIndex}`);
        params.push(filters.userType);
        paramIndex++;
      }

      if (filters.action) {
        conditions.push(`action = $${paramIndex}`);
        params.push(filters.action);
        paramIndex++;
      }

      if (filters.targetType) {
        conditions.push(`target_type = $${paramIndex}`);
        params.push(filters.targetType);
        paramIndex++;
      }

      if (filters.startDate) {
        conditions.push(`DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`);
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`);
        params.push(filters.endDate);
        paramIndex++;
      }

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
        params.push(limit, offset);

        Promise.all([
          this.query(countQuery, params.slice(0, -2)), // Count without LIMIT/OFFSET
          this.query(query, params) // Paginated results
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
      let params = [];
      let conditions = [];
      let paramIndex = 1;

      if (filters.startDate) {
        conditions.push(`DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $${paramIndex}`);
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') <= $${paramIndex}`);
        params.push(filters.endDate);
        paramIndex++;
      }

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
        WHERE LOWER(user_email) = $1 
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
}

module.exports = AuditLog;