-- Migration 010: Timezone Performance Indexes
-- Created: 2025-12-16
-- Purpose: Optimize queries with Hong Kong timezone conversions and add composite indexes
--          for common filter patterns in trading_requests and audit_logs tables

BEGIN;

-- ============================================================================
-- FUNCTIONAL INDEXES FOR TIMEZONE CONVERSIONS
-- ============================================================================

-- Trading Requests: Functional index for Hong Kong timezone date queries
-- This optimizes queries like: DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') >= $1
CREATE INDEX IF NOT EXISTS idx_tr_created_at_hk_func
ON trading_requests(DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong'));

-- Audit Logs: Functional index for Hong Kong timezone date queries
CREATE INDEX IF NOT EXISTS idx_audit_created_at_hk_func
ON audit_logs(DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong'));

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- ============================================================================

-- Index for employee email + status + created_at (common in admin views)
-- Optimizes: WHERE employee_email = ? AND status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tr_employee_status_created
ON trading_requests(employee_email, status, created_at DESC);

-- Index for instrument_type + status + created_at (filtering by instrument type)
-- Optimizes: WHERE instrument_type = ? AND status = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tr_instrument_status_created
ON trading_requests(instrument_type, status, created_at DESC);

-- Index for ticker + created_at (ticker search with date ordering)
-- Optimizes: WHERE ticker = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tr_ticker_created
ON trading_requests(ticker, created_at DESC);

-- Index for trading_type + created_at (buy/sell filter with date ordering)
-- Optimizes: WHERE trading_type = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tr_trading_type_created
ON trading_requests(trading_type, created_at DESC);

-- Index for escalated + created_at (escalated requests view)
-- Optimizes: WHERE escalated = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tr_escalated_created
ON trading_requests(escalated, created_at DESC);

-- ============================================================================
-- AUDIT LOGS COMPOSITE INDEXES
-- ============================================================================

-- Index for user_email + created_at (user activity history)
-- Optimizes: WHERE user_email = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_user_email_created
ON audit_logs(user_email, created_at DESC);

-- Index for user_type + created_at (admin vs employee activity)
-- Optimizes: WHERE user_type = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_user_type_created
ON audit_logs(user_type, created_at DESC);

-- Index for action + created_at (specific action tracking)
-- Optimizes: WHERE action = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_action_created
ON audit_logs(action, created_at DESC);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('trading_requests', 'audit_logs')
AND indexname LIKE '%idx_%'
ORDER BY tablename, indexname;

-- Show index usage statistics (requires pg_stat_user_indexes)
-- Note: This only works after indexes have been used
SELECT
    schemaname,
    relname AS tablename,
    indexrelname AS indexname,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND relname IN ('trading_requests', 'audit_logs')
ORDER BY idx_scan DESC;

-- ============================================================================
-- PERFORMANCE TIPS
-- ============================================================================

/*
For optimal performance with timezone queries:

1. When querying by Hong Kong date, use the exact same expression:
   WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong') = $1
   -- This will use the functional index idx_tr_created_at_hk_func

2. For date ranges, still use the functional index:
   WHERE DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong')
     BETWEEN $1 AND $2

3. Consider storing pre-computed Hong Kong timestamp if query performance
   remains an issue with very large datasets:
   ALTER TABLE trading_requests ADD COLUMN created_at_hk TIMESTAMP;
   UPDATE trading_requests SET created_at_hk = created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hong_Kong';
   CREATE INDEX idx_tr_created_at_hk ON trading_requests(created_at_hk);
*/

COMMIT;

-- ============================================================================
-- ROLLBACK SQL (if needed)
-- ============================================================================
/*
-- To rollback these indexes:
BEGIN;
DROP INDEX IF EXISTS idx_tr_created_at_hk_func;
DROP INDEX IF EXISTS idx_audit_created_at_hk_func;
DROP INDEX IF EXISTS idx_tr_employee_status_created;
DROP INDEX IF EXISTS idx_tr_instrument_status_created;
DROP INDEX IF EXISTS idx_tr_ticker_created;
DROP INDEX IF EXISTS idx_tr_trading_type_created;
DROP INDEX IF EXISTS idx_tr_escalated_created;
DROP INDEX IF EXISTS idx_audit_user_email_created;
DROP INDEX IF EXISTS idx_audit_user_type_created;
DROP INDEX IF EXISTS idx_audit_action_created;
COMMIT;
*/