-- Migration 009: Add support for ETF and INDEX instrument types
-- Allow trading requests for ETFs (like ARKQ) and index funds

BEGIN;

-- Update trading_requests table to allow ETF and INDEX
ALTER TABLE trading_requests DROP CONSTRAINT IF EXISTS trading_requests_instrument_type_check;
ALTER TABLE trading_requests ADD CONSTRAINT trading_requests_instrument_type_check 
  CHECK(instrument_type IN ('equity', 'bond', 'etf', 'index'));

-- Update restricted_stocks table to allow ETF and INDEX  
ALTER TABLE restricted_stocks DROP CONSTRAINT IF EXISTS restricted_stocks_instrument_type_check;
ALTER TABLE restricted_stocks ADD CONSTRAINT restricted_stocks_instrument_type_check 
  CHECK(instrument_type IN ('equity', 'bond', 'etf', 'index'));

-- Update restricted_stock_changelog table to allow ETF and INDEX
ALTER TABLE restricted_stock_changelog DROP CONSTRAINT IF EXISTS restricted_stock_changelog_instrument_type_check;
ALTER TABLE restricted_stock_changelog ADD CONSTRAINT restricted_stock_changelog_instrument_type_check 
  CHECK(instrument_type IN ('equity', 'bond', 'etf', 'index'));

-- Add index for better performance on instrument_type queries
CREATE INDEX IF NOT EXISTS idx_trading_requests_instrument_type_status ON trading_requests(instrument_type, status);

COMMIT;