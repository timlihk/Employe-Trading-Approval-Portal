const database = require('./database');

class AuditLog {
  static logActivity(userEmail, userType, action, targetType, targetId = null, details = null, ipAddress = null, userAgent = null, sessionId = null) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO audit_logs (user_email, user_type, action, target_type, target_id, details, ip_address, user_agent, session_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      
      database.run(query, [userEmail.toLowerCase(), userType, action, targetType, targetId, details, ipAddress, userAgent, sessionId]).then(result => {
        resolve(result.lastID);
      }).catch(err => {
        reject(err);
      });
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
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(filters.startDate + ' 00:00:00');
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(filters.endDate + ' 23:59:59');
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
      }

      database.query(query, params).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
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
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(filters.startDate + ' 00:00:00');
        paramIndex++;
      }

      if (filters.endDate) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(filters.endDate + ' 23:59:59');
        paramIndex++;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      database.get(query, params).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static cleanupOldLogs(retentionDays) {
    return new Promise((resolve, reject) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const query = 'DELETE FROM audit_logs WHERE created_at < $1';
      
      database.run(query, [cutoffDate.toISOString()]).then(result => {
        resolve(result.changes);
      }).catch(err => {
        reject(err);
      });
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
      
      database.query(query, [userEmail.toLowerCase(), limit]).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
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
      
      database.query(query, [cutoffDate.toISOString(), limit]).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }
}

module.exports = AuditLog;