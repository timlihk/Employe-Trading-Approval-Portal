-- Production Performance Indexes
-- Execute these in Railway PostgreSQL Console

-- Sessions performance (cleanup and lookup)
CREATE INDEX IF NOT EXISTS idx_session_expire ON "session"(expire);

-- Trading requests core indexes
CREATE INDEX IF NOT EXISTS idx_tr_employee_email ON trading_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_tr_created_at ON trading_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_tr_ticker ON trading_requests(ticker);
CREATE INDEX IF NOT EXISTS idx_tr_status ON trading_requests(status);
CREATE INDEX IF NOT EXISTS idx_tr_escalated ON trading_requests(escalated);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tr_employee_created ON trading_requests(employee_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tr_status_created ON trading_requests(status, created_at DESC);

-- Audit logs performance indexes  
CREATE INDEX IF NOT EXISTS idx_audit_user_email ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_type ON audit_logs(user_type);

-- Composite index for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_created_user ON audit_logs(created_at DESC, user_email);

-- Verify indexes were created
SELECT schemaname, tablename, indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('session', 'trading_requests', 'audit_logs')
ORDER BY tablename, indexname;