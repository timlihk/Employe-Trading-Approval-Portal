-- Add brokerage_name column to statement_requests
-- Allows tracking which brokerage account each statement is for

ALTER TABLE statement_requests
  ADD COLUMN IF NOT EXISTS brokerage_name VARCHAR(255);

-- Drop old unique constraint (one upload per period per employee)
-- and replace with one that includes brokerage_name (allows multiple uploads per period)
ALTER TABLE statement_requests
  DROP CONSTRAINT IF EXISTS statement_requests_period_year_period_month_employee_email_key;

ALTER TABLE statement_requests
  ADD CONSTRAINT statement_requests_period_brokerage_unique
  UNIQUE(period_year, period_month, employee_email, brokerage_name);

CREATE INDEX IF NOT EXISTS idx_statement_requests_brokerage
  ON statement_requests(brokerage_name);
