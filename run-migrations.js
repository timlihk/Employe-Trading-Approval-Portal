#!/usr/bin/env node

/**
 * Migration runner for UUID implementation
 * This script should be run once to add UUID columns to existing database
 */

const fs = require('fs');
const path = require('path');
const database = require('./src/models/database');

async function runMigrations() {
  console.log('🔄 Starting UUID migration...');
  
  try {
    // Connect to database
    await database.connect();
    const pool = database.getPool();
    
    if (!pool) {
      console.log('⚠️  No database connection available - skipping migrations');
      return;
    }
    
    console.log('✅ Database connected');
    
    // Read and execute the UUID migration
    const migrationPath = path.join(__dirname, 'migrations', '006_uuid_migration.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.log('❌ Migration file not found:', migrationPath);
      return;
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📄 Loaded migration script');
    
    // Execute the migration
    await pool.query(migrationSQL);
    console.log('✅ UUID migration completed successfully!');
    
    // Verify UUID columns exist
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'trading_requests' 
      AND column_name = 'uuid'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ UUID column verified in trading_requests table');
    } else {
      console.log('❌ UUID column not found - migration may have failed');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  UUID columns already exist - migration previously completed');
    } else {
      console.error('Full error:', error);
      process.exit(1);
    }
  } finally {
    if (database.getPool()) {
      await database.getPool().end();
      console.log('🔌 Database connection closed');
    }
    process.exit(0);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };