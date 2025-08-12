-- Add instrument_type column to trading_requests table to support bonds
-- Migration: 005_add_instrument_type.sql

-- Add instrument_type column to trading_requests
ALTER TABLE trading_requests 
ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
CHECK(instrument_type IN ('equity', 'bond'));

-- Add comment for documentation
COMMENT ON COLUMN trading_requests.instrument_type IS 'Type of instrument: equity for stocks, bond for bonds (identified by ISIN)';

-- Update existing records to be equity (they were all stocks before)
UPDATE trading_requests SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = '';

-- Add instrument_type column to restricted_stocks as well
ALTER TABLE restricted_stocks 
ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
CHECK(instrument_type IN ('equity', 'bond'));

-- Add comment for documentation
COMMENT ON COLUMN restricted_stocks.instrument_type IS 'Type of instrument: equity for stocks, bond for bonds (identified by ISIN)';

-- Update existing restricted stocks to be equity
UPDATE restricted_stocks SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = '';

-- Create index for better performance on instrument_type queries
CREATE INDEX IF NOT EXISTS idx_trading_requests_instrument_type ON trading_requests(instrument_type);
CREATE INDEX IF NOT EXISTS idx_restricted_stocks_instrument_type ON restricted_stocks(instrument_type);

-- Update the restricted_stock_changelog table as well for consistency
ALTER TABLE restricted_stock_changelog 
ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(10) NOT NULL DEFAULT 'equity' 
CHECK(instrument_type IN ('equity', 'bond'));

UPDATE restricted_stock_changelog SET instrument_type = 'equity' WHERE instrument_type IS NULL OR instrument_type = '';