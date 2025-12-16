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
      
      // Create tables for PostgreSQL
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS restricted_stocks (
          uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          ticker VARCHAR(20) UNIQUE NOT NULL,
          company_name TEXT NOT NULL,
          exchange VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
          escalated_at TIMESTAMP,
          custom_id VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);


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

      // Create indexes for performance
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_trading_requests_instrument_type ON trading_requests(instrument_type)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_restricted_stocks_instrument_type ON restricted_stocks(instrument_type)');

      console.log('✅ PostgreSQL database initialized successfully with bond support');
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