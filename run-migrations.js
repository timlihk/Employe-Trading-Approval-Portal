#!/usr/bin/env node

/**
 * Migration runner for UUID implementation
 * This script should be run once to add UUID columns to existing database
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigrations() {
  console.log('🔄 Starting migrations...');
  
  let pool = null;
  
  try {
    // Create dedicated pool for migrations
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  No DATABASE_URL found - skipping migrations');
      return;
    }
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Test the connection
    await pool.query('SELECT 1');
    console.log('✅ Database connected for migrations');
    
    // Get all migration files in order
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Run in alphabetical order
    
    console.log('📁 Found migrations:', migrationFiles);
    
    // Execute each migration
    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`🔄 Running migration: ${file}`);
      
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await pool.query(migrationSQL);
        console.log(`✅ Migration ${file} completed successfully!`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('does not exist')) {
          console.log(`ℹ️  Migration ${file} - changes already applied or not needed`);
        } else {
          console.error(`❌ Migration ${file} failed:`, error.message);
          throw error;
        }
      }
    }
    
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
    // Always close the migration pool since it's dedicated for this process
    if (pool) {
      await pool.end();
      console.log('🔌 Migration database connection closed');
    }
    
    if (require.main === module) {
      process.exit(0);
    }
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };