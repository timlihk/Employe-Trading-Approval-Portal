-- Brokerage account registry for employees
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS brokerage_accounts (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_email VARCHAR(255) NOT NULL,
  firm_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_email, firm_name, account_number)
);

CREATE INDEX IF NOT EXISTS idx_brokerage_accounts_email
  ON brokerage_accounts(LOWER(employee_email));
