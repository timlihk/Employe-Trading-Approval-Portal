-- Migration: Add index on session table expire column for efficient cleanup
-- Created: 2025-08-08
-- Purpose: Optimize session cleanup queries for connect-pg-simple

-- Create index on expire column if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- Verify index creation (commented out - psql command not needed in migration)
-- \d+ session;