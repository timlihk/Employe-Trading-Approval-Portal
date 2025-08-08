-- Pagination and Performance Indexes
-- Apply these in Railway PostgreSQL console

-- Session table index for cleanup
CREATE INDEX IF NOT EXISTS idx_session_expire ON "session"(expire);

-- Trading requests indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_email ON trading_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_trading_requests_created_at ON trading_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_requests_ticker ON trading_requests(ticker);
CREATE INDEX IF NOT EXISTS idx_trading_requests_status ON trading_requests(status);
CREATE INDEX IF NOT EXISTS idx_trading_requests_escalated ON trading_requests(escalated);

-- Composite index for employee queries with pagination
CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_created ON trading_requests(employee_email, created_at DESC);

-- Audit logs indexes for common query patterns  
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_type ON audit_logs(user_type);

-- Composite index for audit log queries with pagination
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_user ON audit_logs(created_at DESC, user_email);