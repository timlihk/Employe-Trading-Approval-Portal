const { Pool } = require('pg');
const { metrics } = require('../utils/metrics');

class Database {
  constructor() {
    if (process.env.DATABASE_URL) {
      console.log('🐘 Using PostgreSQL database');
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    } else {
      console.log('⚠️  No DATABASE_URL found - PostgreSQL not available');
      console.log('📱 This might be expected during Railway initial deployment');
      // For now, we'll use a minimal fallback that doesn't crash the app
      this.pool = null;
    }
    
    this.init();
    metrics.database.connectionStatus = this.pool ? 'connected' : 'disconnected';
  }

  async init() {
    if (!this.pool) {
      console.log('⚠️  Skipping database initialization - no PostgreSQL connection available');
      return;
    }
    
    try {
      console.log('🔄 Initializing PostgreSQL database schema...');
      
      // Enable UUID extension
      await this.pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
      console.log('✅ UUID extension enabled');
      
      // Create tables for PostgreSQL (using TIMESTAMPTZ for proper timezone handling)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS restricted_stocks (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          ticker VARCHAR(20) UNIQUE NOT NULL,
          company_name TEXT NOT NULL,
          exchange VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS trading_requests (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
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
          escalated_at TIMESTAMPTZ,
          custom_id VARCHAR(50),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMPTZ
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          user_type VARCHAR(20) NOT NULL CHECK(user_type IN ('admin', 'employee')),
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT,
          details TEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          session_id TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS restricted_stock_changelog (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          ticker VARCHAR(20) NOT NULL,
          company_name TEXT NOT NULL,
          action VARCHAR(20) NOT NULL CHECK(action IN ('added', 'removed')),
          admin_email VARCHAR(255) NOT NULL,
          reason TEXT,
          ip_address VARCHAR(45),
          user_agent TEXT,
          session_id TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Statement requests table for monthly trading statement collection
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS statement_requests (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          period_year INTEGER NOT NULL,
          period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
          employee_email VARCHAR(255) NOT NULL,
          employee_name VARCHAR(255),
          status VARCHAR(20) NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'uploaded', 'overdue', 'skipped')),
          email_sent_at TIMESTAMPTZ,
          email_message_id VARCHAR(255),
          upload_token VARCHAR(64) UNIQUE,
          uploaded_at TIMESTAMPTZ,
          sharepoint_item_id VARCHAR(255),
          sharepoint_file_url TEXT,
          original_filename VARCHAR(500),
          file_size_bytes BIGINT,
          file_content_type VARCHAR(100),
          reminder_count INTEGER DEFAULT 0,
          last_reminder_at TIMESTAMPTZ,
          deadline_at TIMESTAMPTZ,
          brokerage_name VARCHAR(255),
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(period_year, period_month, employee_email, brokerage_name)
        )
      `);

      // Brokerage accounts registry
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS brokerage_accounts (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          employee_email VARCHAR(255) NOT NULL,
          firm_name VARCHAR(255) NOT NULL,
          account_number VARCHAR(100) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(employee_email, firm_name, account_number)
        )
      `);

      // Employee profiles for onboarding and account confirmation tracking
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS employee_profiles (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          employee_email VARCHAR(255) UNIQUE NOT NULL,
          accounts_confirmed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_employee_profiles_email ON employee_profiles(employee_email)');

      // Drop unused compliance_settings table if it exists
      await this.pool.query('DROP TABLE IF EXISTS compliance_settings');
      console.log('🗑️  Removed unused compliance_settings table');

      // Add instrument_type column for bond support
      await this.pool.query(`
        ALTER TABLE trading_requests 
        ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
        CHECK(instrument_type IN ('equity', 'bond'))
      `);
      
      await this.pool.query(`
        ALTER TABLE restricted_stocks 
        ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
        CHECK(instrument_type IN ('equity', 'bond'))
      `);
      
      await this.pool.query(`
        ALTER TABLE restricted_stock_changelog 
        ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
        CHECK(instrument_type IN ('equity', 'bond'))
      `);

      // Update existing records to be equity
      await this.pool.query("UPDATE trading_requests SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = ''");
      await this.pool.query("UPDATE restricted_stocks SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = ''");
      await this.pool.query("UPDATE restricted_stock_changelog SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = ''");

      // Upgrade existing TIMESTAMP columns to TIMESTAMPTZ (safe: existing data is UTC)
      const timestampUpgrades = [
        `ALTER TABLE trading_requests ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE trading_requests ALTER COLUMN processed_at TYPE TIMESTAMPTZ USING processed_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE trading_requests ALTER COLUMN escalated_at TYPE TIMESTAMPTZ USING escalated_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE audit_logs ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE restricted_stock_changelog ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE restricted_stocks ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN email_sent_at TYPE TIMESTAMPTZ USING email_sent_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN last_reminder_at TYPE TIMESTAMPTZ USING last_reminder_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE statement_requests ALTER COLUMN deadline_at TYPE TIMESTAMPTZ USING deadline_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE brokerage_accounts ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'`,
        `ALTER TABLE brokerage_accounts ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'`,
      ];
      for (const sql of timestampUpgrades) {
        try { await this.pool.query(sql); } catch (e) { /* already TIMESTAMPTZ */ }
      }
      console.log('✅ TIMESTAMP columns upgraded to TIMESTAMPTZ');

      // Create indexes for performance
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_instrument_type ON trading_requests(instrument_type)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_restricted_stocks_instrument_type ON restricted_stocks(instrument_type)');

      // Core query indexes
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_email ON trading_requests(employee_email)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_status ON trading_requests(status)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_created_at ON trading_requests(created_at DESC)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_ticker ON trading_requests(ticker)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_escalated_status ON trading_requests(escalated, status)');

      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email)');

      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON restricted_stock_changelog(created_at DESC)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_changelog_ticker ON restricted_stock_changelog(ticker)');

      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_statement_requests_employee_email ON statement_requests(employee_email)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_statement_requests_status ON statement_requests(status)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_statement_requests_status_deadline ON statement_requests(status, deadline_at)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_statement_requests_period ON statement_requests(period_year, period_month)');

      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_employee_email ON brokerage_accounts(employee_email)');

      console.log('✅ PostgreSQL database initialized with indexes and TIMESTAMPTZ support');
    } catch (error) {
      console.error('❌ Error initializing PostgreSQL database:', error);
      console.error('This might be a temporary issue during Railway deployment');
      // Don't throw the error to prevent app crash during deployment
      // Railway will retry the healthcheck
    }
  }

  // Direct PostgreSQL query method
  async query(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not available - PostgreSQL connection not established');
    }
    metrics.database.queryCount++;
    const startTime = Date.now();
    try {
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Slow query threshold: 1 second
        metrics.database.slowQueryCount++;
      }
      return result.rows;
    } catch (error) {
      metrics.database.errorCount++;
      throw error;
    }
  }

  // PostgreSQL run method for INSERT/UPDATE/DELETE
  async run(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not available - PostgreSQL connection not established');
    }
    metrics.database.queryCount++;
    const startTime = Date.now();
    try {
      // For INSERT, return UUID instead of numeric ID
      if (sql.toLowerCase().includes('insert')) {
        sql += ' RETURNING uuid';
      }
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Slow query threshold: 1 second
        metrics.database.slowQueryCount++;
      }
      if (sql.toLowerCase().includes('insert')) {
        return { uuid: result.rows[0]?.uuid, changes: result.rowCount };
      } else {
        return { uuid: null, changes: result.rowCount };
      }
    } catch (error) {
      metrics.database.errorCount++;
      throw error;
    }
  }

  // PostgreSQL get method for single row
  async get(sql, params = []) {
    if (!this.pool) {
      throw new Error('Database not available - PostgreSQL connection not established');
    }
    metrics.database.queryCount++;
    const startTime = Date.now();
    try {
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;
      if (duration > 1000) { // Slow query threshold: 1 second
        metrics.database.slowQueryCount++;
      }
      return result.rows[0] || null;
    } catch (error) {
      metrics.database.errorCount++;
      throw error;
    }
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