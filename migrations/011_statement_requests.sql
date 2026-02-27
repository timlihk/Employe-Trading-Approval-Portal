-- Monthly trading statement request tracking
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS statement_requests (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK(period_month BETWEEN 1 AND 12),
  employee_email VARCHAR(255) NOT NULL,
  employee_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'uploaded', 'overdue', 'skipped')),
  email_sent_at TIMESTAMP,
  email_message_id VARCHAR(255),
  upload_token VARCHAR(64) UNIQUE,
  uploaded_at TIMESTAMP,
  sharepoint_item_id VARCHAR(255),
  sharepoint_file_url TEXT,
  original_filename VARCHAR(500),
  file_size_bytes BIGINT,
  file_content_type VARCHAR(100),
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMP,
  deadline_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period_year, period_month, employee_email)
);

CREATE INDEX IF NOT EXISTS idx_statement_requests_period
  ON statement_requests(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_statement_requests_email
  ON statement_requests(LOWER(employee_email));
CREATE INDEX IF NOT EXISTS idx_statement_requests_status
  ON statement_requests(status);
CREATE INDEX IF NOT EXISTS idx_statement_requests_upload_token
  ON statement_requests(upload_token);
CREATE INDEX IF NOT EXISTS idx_statement_requests_deadline
  ON statement_requests(deadline_at);
