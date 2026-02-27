-- Migration 015: Employee profiles for onboarding and account confirmation tracking

CREATE TABLE IF NOT EXISTS employee_profiles (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  employee_email VARCHAR(255) UNIQUE NOT NULL,
  accounts_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_email ON employee_profiles(employee_email);
