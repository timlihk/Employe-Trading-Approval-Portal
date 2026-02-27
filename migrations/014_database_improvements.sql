-- Migration 014: Database performance improvements
-- 1. Upgrade TIMESTAMP to TIMESTAMPTZ for proper timezone handling
-- 2. Add missing indexes for frequently queried columns
-- 3. Sargable date queries (handled in application code)

-- ============================================================
-- STEP 1: Upgrade TIMESTAMP columns to TIMESTAMPTZ
-- Existing data is UTC (from CURRENT_TIMESTAMP on UTC servers)
-- ============================================================

-- trading_requests
ALTER TABLE trading_requests
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN processed_at TYPE TIMESTAMPTZ USING processed_at AT TIME ZONE 'UTC',
  ALTER COLUMN escalated_at TYPE TIMESTAMPTZ USING escalated_at AT TIME ZONE 'UTC';

-- audit_logs
ALTER TABLE audit_logs
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- restricted_stock_changelog
ALTER TABLE restricted_stock_changelog
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- restricted_stocks
ALTER TABLE restricted_stocks
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- statement_requests
ALTER TABLE statement_requests
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN email_sent_at TYPE TIMESTAMPTZ USING email_sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN uploaded_at TYPE TIMESTAMPTZ USING uploaded_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_reminder_at TYPE TIMESTAMPTZ USING last_reminder_at AT TIME ZONE 'UTC',
  ALTER COLUMN deadline_at TYPE TIMESTAMPTZ USING deadline_at AT TIME ZONE 'UTC';

-- brokerage_accounts
ALTER TABLE brokerage_accounts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- ============================================================
-- STEP 2: Add missing indexes
-- ============================================================

-- trading_requests indexes
CREATE INDEX IF NOT EXISTS idx_trading_requests_employee_email ON trading_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_trading_requests_status ON trading_requests(status);
CREATE INDEX IF NOT EXISTS idx_trading_requests_created_at ON trading_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_requests_ticker ON trading_requests(ticker);
CREATE INDEX IF NOT EXISTS idx_trading_requests_escalated_status ON trading_requests(escalated, status);

-- audit_logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);

-- restricted_stock_changelog indexes
CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON restricted_stock_changelog(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_ticker ON restricted_stock_changelog(ticker);

-- statement_requests indexes
CREATE INDEX IF NOT EXISTS idx_statement_requests_employee_email ON statement_requests(employee_email);
CREATE INDEX IF NOT EXISTS idx_statement_requests_status ON statement_requests(status);
CREATE INDEX IF NOT EXISTS idx_statement_requests_status_deadline ON statement_requests(status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_statement_requests_period ON statement_requests(period_year, period_month);

-- brokerage_accounts indexes
CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_employee_email ON brokerage_accounts(employee_email);
