-- Migration 007: Make UUID the primary key and remove numeric ID columns
-- This migration will make the system fully UUID-based

BEGIN;

-- Update all target_id references in audit_logs to use UUIDs instead of numeric IDs
UPDATE audit_logs 
SET target_id = (
    SELECT tr.uuid::text 
    FROM trading_requests tr 
    WHERE tr.id::text = audit_logs.target_id
)
WHERE target_type = 'trading_request' 
AND target_id ~ '^[0-9]+$';

-- Drop existing primary key constraints and create new UUID-based ones
-- 1. Trading Requests
ALTER TABLE trading_requests DROP CONSTRAINT IF EXISTS trading_requests_pkey;
ALTER TABLE trading_requests DROP COLUMN IF EXISTS id;
ALTER TABLE trading_requests ADD PRIMARY KEY (uuid);

-- 2. Audit Logs  
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS id;
ALTER TABLE audit_logs ADD PRIMARY KEY (uuid);

-- 3. Restricted Stocks
ALTER TABLE restricted_stocks DROP CONSTRAINT IF EXISTS restricted_stocks_pkey;
ALTER TABLE restricted_stocks DROP COLUMN IF EXISTS id;
ALTER TABLE restricted_stocks ADD PRIMARY KEY (uuid);

-- 4. Restricted Stock Changelog
ALTER TABLE restricted_stock_changelog DROP CONSTRAINT IF EXISTS restricted_stock_changelog_pkey;
ALTER TABLE restricted_stock_changelog DROP COLUMN IF EXISTS id;
ALTER TABLE restricted_stock_changelog ADD PRIMARY KEY (uuid);

-- Update indexes for better performance with UUID primary keys
DROP INDEX IF EXISTS idx_trading_requests_uuid;
DROP INDEX IF EXISTS idx_audit_logs_uuid;
DROP INDEX IF EXISTS idx_restricted_stocks_uuid;
DROP INDEX IF EXISTS idx_restricted_stock_changelog_uuid;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_trading_requests_email_created ON trading_requests(employee_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_requests_status_created ON trading_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);

COMMIT;