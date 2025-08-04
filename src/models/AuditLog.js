const database = require('./database');

class AuditLog {
  static logActivity(userEmail, userType, action, targetType, targetId = null, details = null, ipAddress = null, userAgent = null, sessionId = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        INSERT INTO audit_logs (user_email, user_type, action, target_type, target_id, details, ip_address, user_agent, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [userEmail.toLowerCase(), userType, action, targetType, targetId, details, ipAddress, userAgent, sessionId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  static getAuditLogs(filters = {}) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      let query = 'SELECT * FROM audit_logs';
      let params = [];
      let conditions = [];

      if (filters.userEmail) {
        conditions.push('LOWER(user_email) = ?');
        params.push(filters.userEmail.toLowerCase());
      }

      if (filters.userType) {
        conditions.push('user_type = ?');
        params.push(filters.userType);
      }

      if (filters.action) {
        conditions.push('action = ?');
        params.push(filters.action);
      }

      if (filters.targetType) {
        conditions.push('target_type = ?');
        params.push(filters.targetType);
      }

      if (filters.startDate) {
        conditions.push('created_at >= ?');
        params.push(filters.startDate + ' 00:00:00');
      }

      if (filters.endDate) {
        conditions.push('created_at <= ?');
        params.push(filters.endDate + ' 23:59:59');
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static getAuditSummary(filters = {}) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
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

      if (filters.startDate) {
        conditions.push('created_at >= ?');
        params.push(filters.startDate + ' 00:00:00');
      }

      if (filters.endDate) {
        conditions.push('created_at <= ?');
        params.push(filters.endDate + ' 23:59:59');
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static cleanupOldLogs(retentionDays) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const query = 'DELETE FROM audit_logs WHERE created_at < ?';
      
      db.run(query, [cutoffDate.toISOString()], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  static getActivityByUser(userEmail, limit = 50) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        SELECT * FROM audit_logs 
        WHERE LOWER(user_email) = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      db.all(query, [userEmail.toLowerCase(), limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static getRecentActivity(hours = 24, limit = 100) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hours);
      
      const query = `
        SELECT * FROM audit_logs 
        WHERE created_at >= ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      db.all(query, [cutoffDate.toISOString(), limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = AuditLog;