const { Pool } = require('pg');

class Database {
  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
    }
    
    console.log('🐘 Using PostgreSQL database');
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    this.init();
  }

  async init() {
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
      throw error;
    }
  }

  // Direct PostgreSQL query method
  async query(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  // PostgreSQL run method for INSERT/UPDATE/DELETE
  async run(sql, params = []) {
    // For INSERT, we need to return the ID
    if (sql.toLowerCase().includes('insert')) {
      sql += ' RETURNING id';
      const result = await this.pool.query(sql, params);
      return { lastID: result.rows[0]?.id, changes: result.rowCount };
    } else {
      const result = await this.pool.query(sql, params);
      return { lastID: null, changes: result.rowCount };
    }
  }

  // PostgreSQL get method for single row
  async get(sql, params = []) {
    const result = await this.pool.query(sql, params);
    return result.rows[0] || null;
  }

  // Get the pool for direct usage if needed
  getPool() {
    return this.pool;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();