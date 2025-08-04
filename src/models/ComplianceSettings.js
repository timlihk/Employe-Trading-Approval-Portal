const database = require('./database');

class ComplianceSettings {
  static getSetting(key) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'SELECT * FROM compliance_settings WHERE setting_key = ?';
      
      db.get(query, [key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  static getAllSettings() {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'SELECT * FROM compliance_settings ORDER BY setting_key';
      
      db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  static updateSetting(key, value, updatedBy, description = null) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        UPDATE compliance_settings 
        SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, description = COALESCE(?, description)
        WHERE setting_key = ?
      `;
      
      db.run(query, [value, updatedBy, description, key], function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          // Setting doesn't exist, create it
          const insertQuery = `
            INSERT INTO compliance_settings (setting_key, setting_value, description, updated_by)
            VALUES (?, ?, ?, ?)
          `;
          db.run(insertQuery, [key, value, description || '', updatedBy], function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          });
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  static createSetting(key, value, description, updatedBy) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = `
        INSERT INTO compliance_settings (setting_key, setting_value, description, updated_by)
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(query, [key, value, description, updatedBy], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  static deleteSetting(key) {
    return new Promise((resolve, reject) => {
      const db = database.getDb();
      const query = 'DELETE FROM compliance_settings WHERE setting_key = ?';
      
      db.run(query, [key], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  static getDataRetentionDays() {
    return this.getSetting('data_retention_days').then(setting => {
      return setting ? parseInt(setting.setting_value) : 2555; // Default 7 years
    });
  }

  static getAuditLogRetentionDays() {
    return this.getSetting('audit_log_retention_days').then(setting => {
      return setting ? parseInt(setting.setting_value) : 2555; // Default 7 years
    });
  }

  static isRegulatoryFilingEnabled() {
    return this.getSetting('regulatory_filing_enabled').then(setting => {
      return setting ? setting.setting_value === 'true' : true;
    });
  }

  static isBlackoutPeriodActive() {
    return this.getSetting('blackout_period_active').then(setting => {
      return setting ? setting.setting_value === 'true' : false;
    });
  }

  static getMaxTradeAmount() {
    return this.getSetting('max_trade_amount').then(setting => {
      return setting ? parseFloat(setting.setting_value) : 1000000;
    });
  }

  static requiresManagerApproval() {
    return this.getSetting('require_manager_approval').then(setting => {
      return setting ? setting.setting_value === 'true' : false;
    });
  }

  static isEmailNotificationEnabled() {
    return this.getSetting('email_notifications_enabled').then(setting => {
      return setting ? setting.setting_value === 'true' : true;
    });
  }
}

module.exports = ComplianceSettings;