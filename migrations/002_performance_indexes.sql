-- Migration: Add performance indexes for trading requests and audit logs
-- Created: 2025-08-08
-- Purpose: Optimize common query patterns for admin and employee views

-- Trading Requests Performance Indexes
CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_email ON trading_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_trading_requests_created_at ON trading_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_trading_requests_ticker ON trading_requests(ticker);
CREATE INDEX IF NOT EXISTS idx_trading_requests_status ON trading_requests(status);
CREATE INDEX IF NOT EXISTS idx_trading_requests_escalated ON trading_requests(escalated);

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_created ON trading_requests(employee_email, created_at);
CREATE INDEX IF NOT EXISTS idx_trading_requests_status_created ON trading_requests(status, created_at);

-- Audit Logs Performance Indexes  
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_type ON audit_logs(user_type);

-- Composite indexes for admin audit views
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_type_created ON audit_logs(user_type, created_at);

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND (tablename = 'trading_requests' OR tablename = 'audit_logs' OR tablename = 'session')
ORDER BY tablename, indexname;