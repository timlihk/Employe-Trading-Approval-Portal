-- Temporary migration: Disable auto-generation of ID columns
-- This prevents numeric IDs from being generated while we transition to UUID-only

BEGIN;

-- For existing tables with SERIAL columns, we can't easily remove them without data loss
-- Instead, we'll modify the default values to prevent auto-generation

-- Check if we still have SERIAL columns and disable their sequences
DO $$
BEGIN
    -- Disable sequence for trading_requests if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'trading_requests' AND column_name = 'id') THEN
        -- Drop the default to prevent auto-generation
        ALTER TABLE trading_requests ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE 'Disabled ID auto-generation for trading_requests';
    END IF;
    
    -- Disable sequence for audit_logs if it exists  
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'audit_logs' AND column_name = 'id') THEN
        ALTER TABLE audit_logs ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE 'Disabled ID auto-generation for audit_logs';
    END IF;
    
    -- Disable sequence for restricted_stocks if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'restricted_stocks' AND column_name = 'id') THEN
        ALTER TABLE restricted_stocks ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE 'Disabled ID auto-generation for restricted_stocks';
    END IF;
    
    -- Disable sequence for restricted_stock_changelog if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'restricted_stock_changelog' AND column_name = 'id') THEN
        ALTER TABLE restricted_stock_changelog ALTER COLUMN id DROP DEFAULT;
        RAISE NOTICE 'Disabled ID auto-generation for restricted_stock_changelog';
    END IF;
END
$$;

COMMIT;