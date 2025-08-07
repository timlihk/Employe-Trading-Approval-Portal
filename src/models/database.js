const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    this.isPostgres = !!process.env.DATABASE_URL;
    
    if (this.isPostgres) {
      console.log('🐘 Using PostgreSQL database');
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      this.db = null; // We'll use pool for PostgreSQL
    } else {
      console.log('📄 Using SQLite database (local development)');
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
      } else {
        console.log('✅ Using existing database at:', dbPath);
      }
      
      this.db = new sqlite3.Database(dbPath);
      this.pool = null;
    }
    
    this.init();
  }

  async init() {
    if (this.isPostgres) {
      await this.initPostgres();
    } else {
      this.initSqlite();
    }
  }

  async initPostgres() {
    try {
      // Create tables for PostgreSQL
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS restricted_stocks (
          id SERIAL PRIMARY KEY,
          ticker VARCHAR(20) UNIQUE NOT NULL,
          company_name TEXT NOT NULL,
          exchange VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS trading_requests (
          id SERIAL PRIMARY KEY,
          employee_email VARCHAR(255) NOT NULL,
          stock_name TEXT NOT NULL,
          ticker VARCHAR(20) NOT NULL,
          shares INTEGER NOT NULL,
          share_price DECIMAL(10,2),
          total_value DECIMAL(15,2),
          currency VARCHAR(3) DEFAULT 'USD',
          share_price_usd DECIMAL(10,2),
          total_value_usd DECIMAL(15,2),
          exchange_rate DECIMAL(10,6),
          trading_type VARCHAR(10) NOT NULL CHECK(trading_type IN ('buy', 'sell')),
          status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          rejection_reason TEXT,
          escalated BOOLEAN DEFAULT FALSE,
          escalation_reason TEXT,
          escalated_at TIMESTAMP,
          custom_id VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          user_type VARCHAR(20) NOT NULL CHECK(user_type IN ('admin', 'employee')),
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          details TEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          session_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS compliance_settings (
          id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value TEXT NOT NULL,
          description TEXT,
          updated_by VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS restricted_stock_changelog (
          id SERIAL PRIMARY KEY,
          ticker VARCHAR(20) NOT NULL,
          company_name TEXT NOT NULL,
          action VARCHAR(20) NOT NULL CHECK(action IN ('added', 'removed')),
          admin_email VARCHAR(255) NOT NULL,
          reason TEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          session_id TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Initialize default compliance settings
      const { rows } = await this.pool.query('SELECT COUNT(*) as count FROM compliance_settings');
      if (parseInt(rows[0].count) === 0) {
        console.log('Initializing default compliance settings...');
        await this.pool.query(`
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

      console.log('✅ PostgreSQL database initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing PostgreSQL database:', error);
    }
  }

  initSqlite() {
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
    return this.db; // For SQLite compatibility
  }

  getPool() {
    return this.pool; // For PostgreSQL
  }

  // Universal query method that works with both databases
  async query(sql, params = []) {
    sql = this.convertDatetime(this.convertSql(sql));
    
    if (this.isPostgres) {
      const result = await this.pool.query(sql, params);
      return result.rows;
    } else {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
  }

  // Convert SQL with ? placeholders to PostgreSQL $1, $2, etc.
  convertSql(sql) {
    if (this.isPostgres) {
      let index = 1;
      return sql.replace(/\?/g, () => `$${index++}`);
    }
    return sql;
  }

  // Convert datetime functions for different databases
  convertDatetime(sql) {
    if (this.isPostgres) {
      return sql.replace(/datetime\('now', 'utc'\)/g, 'CURRENT_TIMESTAMP');
    }
    return sql;
  }

  // Universal run method for INSERT/UPDATE/DELETE
  async run(sql, params = []) {
    sql = this.convertDatetime(this.convertSql(sql));
    
    if (this.isPostgres) {
      // For INSERT, we need to return the ID
      if (sql.toLowerCase().includes('insert')) {
        sql += ' RETURNING id';
        const result = await this.pool.query(sql, params);
        return { lastID: result.rows[0]?.id, changes: result.rowCount };
      } else {
        const result = await this.pool.query(sql, params);
        return { lastID: null, changes: result.rowCount };
      }
    } else {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }

  // Universal get method for single row
  async get(sql, params = []) {
    sql = this.convertDatetime(this.convertSql(sql));
    
    if (this.isPostgres) {
      const result = await this.pool.query(sql, params);
      return result.rows[0] || null;
    } else {
      return new Promise((resolve, reject) => {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  }

  close() {
    if (this.isPostgres) {
      this.pool.end();
    } else {
      this.db.close();
    }
  }
}

module.exports = new Database();