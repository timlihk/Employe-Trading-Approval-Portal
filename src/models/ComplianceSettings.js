const database = require('./database');

class ComplianceSettings {
  static getAllSettings() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM compliance_settings ORDER BY setting_key';
      
      database.query(query, []).then(rows => {
        resolve(rows);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static getSetting(key) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM compliance_settings WHERE setting_key = $1';
      
      database.get(query, [key]).then(row => {
        resolve(row);
      }).catch(err => {
        reject(err);
      });
    });
  }

  static updateSetting(key, value, updatedBy, description = null) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE compliance_settings 
        SET setting_value = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP, description = COALESCE($3, description)
        WHERE setting_key = $4
      `;
      
      database.run(query, [value, updatedBy, description, key]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static createSetting(key, value, description, updatedBy) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO compliance_settings (setting_key, setting_value, description, updated_by)
        VALUES ($1, $2, $3, $4)
      `;
      
      database.run(query, [key, value, description, updatedBy]).then(result => {
        resolve({ id: result.lastID, setting_key: key, setting_value: value, description, updated_by: updatedBy });
      }).catch(err => {
        reject(err);
      });
    });
  }

  static deleteSetting(key) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM compliance_settings WHERE setting_key = $1';
      
      database.run(query, [key]).then(result => {
        resolve({ changes: result.changes });
      }).catch(err => {
        reject(err);
      });
    });
  }

  // Convenience methods for common settings
  static getDataRetentionDays() {
    return this.getSetting('data_retention_days').then(row => {
      return row ? parseInt(row.setting_value) : 2555; // Default 7 years
    });
  }

  static getMaxTradeAmount() {
    return this.getSetting('max_trade_amount').then(row => {
      return row ? parseFloat(row.setting_value) : 1000000; // Default 1M
    });
  }

  static isManagerApprovalRequired() {
    return this.getSetting('require_manager_approval').then(row => {
      return row ? row.setting_value === 'true' : false;
    });
  }

  static isBlackoutPeriodActive() {
    return this.getSetting('blackout_period_active').then(row => {
      return row ? row.setting_value === 'true' : false;
    });
  }

  static isEmailNotificationsEnabled() {
    return this.getSetting('email_notifications_enabled').then(row => {
      return row ? row.setting_value === 'true' : true;
    });
  }
}

module.exports = ComplianceSettings;