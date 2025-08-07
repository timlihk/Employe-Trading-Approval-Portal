const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    // Use Railway Volume path if available, otherwise local path
    const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../..');
    const dbPath = path.join(dataDir, 'trading.db');
    const dbExists = fs.existsSync(dbPath);
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!dbExists) {
      console.warn('⚠️  WARNING: Database file does not exist. Creating new database.');
      if (!process.env.RAILWAY_VOLUME_MOUNT_PATH) {
        console.warn('⚠️  Data will be lost on Railway redeploy without persistent storage!');
        console.warn('⚠️  Set up Railway Volume to persist data across deployments.');
      }
    } else {
      console.log('✅ Using existing database at:', dbPath);
    }
    
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS restricted_stocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT UNIQUE NOT NULL,
          company_name TEXT NOT NULL,
          exchange TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'utc'))
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS trading_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_email TEXT NOT NULL,
          stock_name TEXT NOT NULL,
          ticker TEXT NOT NULL,
          shares INTEGER NOT NULL,
          share_price DECIMAL(10,2),
          total_value DECIMAL(15,2),
          currency TEXT DEFAULT 'USD',
          share_price_usd DECIMAL(10,2),
          total_value_usd DECIMAL(15,2),
          exchange_rate DECIMAL(10,6),
          trading_type TEXT NOT NULL CHECK(trading_type IN ('buy', 'sell')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          rejection_reason TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          processed_at DATETIME
        )
      `);

      // Add new columns to existing table if they don't exist
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN share_price DECIMAL(10,2)`, (err) => {
        // Ignore error if column already exists
      });
      
      // Add escalation columns
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN escalated BOOLEAN DEFAULT 0`, (err) => {
        // Ignore error if column already exists
      });
      
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN escalation_reason TEXT`, (err) => {
        // Ignore error if column already exists
      });
      
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN escalated_at DATETIME`, (err) => {
        // Ignore error if column already exists
      });
      
      // Add custom ID column for alphanumeric trade IDs
      this.db.run(`PRAGMA table_info(trading_requests)`, (err, rows) => {
        if (!err) {
          // Check if custom_id column exists
          this.db.all(`PRAGMA table_info(trading_requests)`, (pragmaErr, columns) => {
            if (!pragmaErr) {
              const hasCustomId = columns && columns.some(col => col.name === 'custom_id');
              if (!hasCustomId) {
                this.db.run(`ALTER TABLE trading_requests ADD COLUMN custom_id TEXT`, (alterErr) => {
                  if (alterErr) {
                    console.error('Error adding custom_id column:', alterErr);
                  } else {
                    console.log('Successfully added custom_id column to trading_requests table');
                  }
                });
              }
            }
          });
        }
      });
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN total_value DECIMAL(15,2)`, (err) => {
        // Ignore error if column already exists
      });
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN currency TEXT DEFAULT 'USD'`, (err) => {
        // Ignore error if column already exists
      });
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN share_price_usd DECIMAL(10,2)`, (err) => {
        // Ignore error if column already exists
      });
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN total_value_usd DECIMAL(15,2)`, (err) => {
        // Ignore error if column already exists
      });
      this.db.run(`ALTER TABLE trading_requests ADD COLUMN exchange_rate DECIMAL(10,6)`, (err) => {
        // Ignore error if column already exists
      });

      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_email TEXT NOT NULL,
          user_type TEXT NOT NULL CHECK(user_type IN ('admin', 'employee')),
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          session_id TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'utc'))
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS compliance_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setting_key TEXT UNIQUE NOT NULL,
          setting_value TEXT NOT NULL,
          description TEXT,
          updated_by TEXT NOT NULL,
          created_at DATETIME DEFAULT (datetime('now', 'utc')),
          updated_at DATETIME DEFAULT (datetime('now', 'utc'))
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS restricted_stock_changelog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticker TEXT NOT NULL,
          company_name TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('added', 'removed')),
          admin_email TEXT NOT NULL,
          reason TEXT,
          ip_address TEXT,
          user_agent TEXT,
          session_id TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'utc'))
        )
      `);

      // Add exchange column to existing restricted_stocks table if it doesn't exist
      this.db.all("PRAGMA table_info(restricted_stocks)", [], (err, columns) => {
        if (!err) {
          const hasExchangeColumn = columns.some(col => col.name === 'exchange');
          if (!hasExchangeColumn) {
            console.log('Adding exchange column to restricted_stocks table...');
            this.db.run('ALTER TABLE restricted_stocks ADD COLUMN exchange TEXT');
          }
        }
      });

      // Initialize with no default restricted stocks for production
      // Restricted stocks will be added by administrators as needed

      // Initialize default compliance settings
      this.db.get('SELECT COUNT(*) as count FROM compliance_settings', [], (err, row) => {
        if (!err && row.count === 0) {
          console.log('Initializing default compliance settings...');
          this.db.run(`
            INSERT INTO compliance_settings (setting_key, setting_value, description, updated_by) VALUES
            ('data_retention_days', '2555', 'Data retention period in days (7 years)', 'system'),
            ('audit_log_retention_days', '2555', 'Audit log retention period in days (7 years)', 'system'),
            ('max_trade_amount', '1000000', 'Maximum trade amount in USD', 'system'),
            ('require_manager_approval', 'false', 'Require manager approval for all trades', 'system'),
            ('blackout_period_active', 'false', 'Whether blackout period is currently active', 'system'),
            ('regulatory_filing_enabled', 'true', 'Enable regulatory filing assistance', 'system'),
            ('email_notifications_enabled', 'true', 'Send email notifications for request approvals/rejections', 'system')
          `);
        }
      });
    });
  }

  getDb() {
    return this.db;
  }

  close() {
    this.db.close();
  }
}

module.exports = new Database();