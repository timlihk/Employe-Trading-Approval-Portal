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

      this.query(query, params).then(resolve).catch(reject);
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