-- Migration to convert trading_requests ID from SERIAL to UUID
-- This migration adds UUID support while maintaining backward compatibility

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Add new UUID column
ALTER TABLE trading_requests ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT uuid_generate_v4() UNIQUE;

-- Step 2: Populate UUID for existing records
UPDATE trading_requests SET uuid = uuid_generate_v4() WHERE uuid IS NULL;

-- Step 3: Add NOT NULL constraint to uuid column
ALTER TABLE trading_requests ALTER COLUMN uuid SET NOT NULL;

-- Step 4: Create index on UUID for performance
CREATE INDEX IF NOT EXISTS idx_trading_requests_uuid ON trading_requests(uuid);

-- Step 5: Add similar UUID columns to related tables
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT uuid_generate_v4() UNIQUE;
UPDATE audit_logs SET uuid = uuid_generate_v4() WHERE uuid IS NULL;
ALTER TABLE audit_logs ALTER COLUMN uuid SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_uuid ON audit_logs(uuid);

ALTER TABLE restricted_stocks ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT uuid_generate_v4() UNIQUE;
UPDATE restricted_stocks SET uuid = uuid_generate_v4() WHERE uuid IS NULL;
ALTER TABLE restricted_stocks ALTER COLUMN uuid SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restricted_stocks_uuid ON restricted_stocks(uuid);

ALTER TABLE restricted_stock_changelog ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT uuid_generate_v4() UNIQUE;
UPDATE restricted_stock_changelog SET uuid = uuid_generate_v4() WHERE uuid IS NULL;
ALTER TABLE restricted_stock_changelog ALTER COLUMN uuid SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restricted_stock_changelog_uuid ON restricted_stock_changelog(uuid);

-- Note: The original 'id' column is kept for backward compatibility
-- It can be removed in a future migration once all code is updated

-- Add comment explaining the migration
COMMENT ON COLUMN trading_requests.uuid IS 'Primary identifier using UUID for better security and privacy';
COMMENT ON COLUMN trading_requests.id IS 'Legacy sequential ID - to be deprecated';