const AuditLog = require('../models/AuditLog');
const ComplianceSettings = require('../models/ComplianceSettings');

class AuditController {
  static async getAuditLogs(req, res) {
    try {
      const filters = {
        userEmail: req.query.user_email,
        userType: req.query.user_type,
        action: req.query.action,
        targetType: req.query.target_type,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      const logs = await AuditLog.getAuditLogs(filters);
      const summary = await AuditLog.getAuditSummary(filters);

      res.json({
        success: true,
        data: {
          logs,
          summary
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs'
      });
    }
  }

  static async getComplianceReport(req, res) {
    try {
      const { start_date, end_date, report_type } = req.query;
      
      const filters = {};
      if (start_date) filters.startDate = start_date;
      if (end_date) filters.endDate = end_date;

      let reportData = {};

      switch (report_type) {
        case 'activity_summary':
          reportData = await AuditLog.getAuditSummary(filters);
          break;
        
        case 'user_activity':
          const logs = await AuditLog.getAuditLogs(filters);
          reportData = {
            total_activities: logs.length,
            activities_by_user: logs.reduce((acc, log) => {
              acc[log.user_email] = (acc[log.user_email] || 0) + 1;
              return acc;
            }, {}),
            activities_by_type: logs.reduce((acc, log) => {
              acc[log.action] = (acc[log.action] || 0) + 1;
              return acc;
            }, {})
          };
          break;
        
        case 'security_events':
          const securityLogs = await AuditLog.getAuditLogs({
            ...filters,
            action: 'login'
          });
          reportData = {
            login_attempts: securityLogs.length,
            unique_users: [...new Set(securityLogs.map(log => log.user_email))].length,
            failed_attempts: securityLogs.filter(log => 
              log.details && log.details.includes('failed')
            ).length
          };
          break;
        
        case 'data_retention':
          const settings = await ComplianceSettings.getAllSettings();
          const retentionDays = await ComplianceSettings.getDataRetentionDays();
          const auditRetentionDays = await ComplianceSettings.getAuditLogRetentionDays();
          
          reportData = {
            current_retention_policy: `${retentionDays} days`,
            audit_log_retention: `${auditRetentionDays} days`,
            compliance_settings: settings,
            next_cleanup_date: new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
          };
          break;
        
        default:
          const allLogs = await AuditLog.getRecentActivity(24 * 30); // Last 30 days
          const allSummary = await AuditLog.getAuditSummary(filters);
          reportData = {
            recent_activity: allLogs.slice(0, 20),
            summary: allSummary,
            compliance_status: 'compliant'
          };
      }

      res.json({
        success: true,
        report_type: report_type || 'general',
        generated_at: new Date().toISOString(),
        period: {
          start_date: start_date || 'all_time',
          end_date: end_date || 'present'
        },
        data: reportData
      });
    } catch (error) {
      console.error('Error generating compliance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate compliance report'
      });
    }
  }

  static async getComplianceSettings(req, res) {
    try {
      const settings = await ComplianceSettings.getAllSettings();
      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('Error fetching compliance settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch compliance settings'
      });
    }
  }

  static async updateComplianceSetting(req, res) {
    try {
      const { setting_key, setting_value, description } = req.body;
      const updatedBy = req.session.adminLoggedIn ? 'admin' : 'system';

      if (!setting_key || !setting_value) {
        return res.status(400).json({
          success: false,
          message: 'Setting key and value are required'
        });
      }

      await ComplianceSettings.updateSetting(setting_key, setting_value, updatedBy, description);

      // Log the compliance setting change
      await AuditLog.logActivity(
        updatedBy,
        'admin',
        'update_compliance_setting',
        'compliance_settings',
        setting_key,
        JSON.stringify({ old_value: 'unknown', new_value: setting_value }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      res.json({
        success: true,
        message: 'Compliance setting updated successfully'
      });
    } catch (error) {
      console.error('Error updating compliance setting:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update compliance setting'
      });
    }
  }

  static async performDataRetentionCleanup(req, res) {
    try {
      const retentionDays = await ComplianceSettings.getAuditLogRetentionDays();
      const deletedCount = await AuditLog.cleanupOldLogs(retentionDays);

      // Log the cleanup activity
      await AuditLog.logActivity(
        req.session.adminLoggedIn ? 'admin' : 'system',
        'admin',
        'data_retention_cleanup',
        'audit_logs',
        null,
        JSON.stringify({ deleted_records: deletedCount, retention_days: retentionDays }),
        req.ip,
        req.get('User-Agent'),
        req.sessionID
      );

      res.json({
        success: true,
        message: `Data retention cleanup completed. ${deletedCount} old records deleted.`,
        data: {
          deleted_records: deletedCount,
          retention_policy: `${retentionDays} days`
        }
      });
    } catch (error) {
      console.error('Error performing data retention cleanup:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform data retention cleanup'
      });
    }
  }

  static async exportComplianceReport(req, res) {
    try {
      const { report_type, start_date, end_date, format, user_type, action } = req.query;
      
      // Get the report data (reuse the logic from getComplianceReport)
      const filters = {};
      if (start_date) filters.startDate = start_date;
      if (end_date) filters.endDate = end_date;
      if (user_type) filters.userType = user_type;
      if (action) filters.action = action;

      let reportData = {};
      let filename = `compliance_report_${new Date().toISOString().split('T')[0]}`;

      switch (report_type) {
        case 'audit_logs':
          let logs;
          try {
            logs = await AuditLog.getAuditLogs({ ...filters, limit: 10000 });
          } catch (dbError) {
            console.error('Database error fetching audit logs:', dbError);
            throw new Error(`Database error: ${dbError.message}`);
          }
          
          if (format === 'csv') {
            const csv = AuditController.convertToCSV(logs, [
              'id', 'user_email', 'user_type', 'action', 'target_type', 
              'target_id', 'details', 'created_at'
            ]);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}_audit_logs.csv"`);
            return res.send(csv);
          }
          reportData = logs;
          break;
        
        default:
          const summary = await AuditLog.getAuditSummary(filters);
          reportData = summary;
      }

      // Default to JSON if format not specified or not CSV
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json({
        report_type: report_type || 'general',
        generated_at: new Date().toISOString(),
        period: { start_date, end_date },
        data: reportData
      });
    } catch (error) {
      console.error('Error exporting compliance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export compliance report'
      });
    }
  }

  static convertToCSV(data, headers) {
    if (!data || data.length === 0) {
      return headers.join(',');
    }
    
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      }).join(',')
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  }
}

module.exports = AuditController;