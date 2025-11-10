-- ============================================
-- 365일 사주 - Initial Database Schema
-- ============================================
-- Version: 1.0.0
-- Date: 2025-11-08
-- Description: Complete database setup for AI Saju SaaS
-- ============================================

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_cron for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================
-- TABLES
-- ============================================

-- --------------------------------------------
-- 1. users - 사용자 계정 및 구독 상태
-- --------------------------------------------

CREATE TABLE users (
  -- Identity
  id TEXT PRIMARY KEY,  -- Clerk user ID (TEXT type)
  email TEXT NOT NULL UNIQUE,

  -- Subscription Info
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid', 'cancelled', 'suspended')),
  tests_remaining INTEGER NOT NULL DEFAULT 3 CHECK (tests_remaining >= 0),
  billing_key TEXT,  -- TossPayments billing key

  -- Billing Dates
  next_billing_date DATE,
  last_daily_report_date DATE,

  -- User Profile (for Saju analysis)
  name TEXT,
  birth_date DATE,
  birth_time TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- 2. analysis - AI 사주 분석 결과
-- --------------------------------------------

CREATE TABLE analysis (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Input Data (JSONB)
  input JSONB NOT NULL,
  -- Structure: { name, birthDate, birthTime, gender }

  -- AI Output
  output_markdown TEXT NOT NULL,  -- Gemini generated markdown
  model TEXT NOT NULL CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-pro')),

  -- Analysis Type
  type TEXT NOT NULL DEFAULT 'free' CHECK (type IN ('free', 'daily', 'manual')),

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- 3. payment_logs - 결제 내역
-- --------------------------------------------

CREATE TABLE payment_logs (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- TossPayments Info
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),

  -- Payment Keys
  billing_key TEXT,
  payment_key TEXT,

  -- Timestamps
  approved_at TIMESTAMPTZ,

  -- Error Info (for failed payments)
  error_code TEXT,
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Users table indexes
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_next_billing ON users(next_billing_date) WHERE plan = 'paid';
CREATE INDEX idx_users_daily_report ON users(last_daily_report_date) WHERE plan = 'paid';

-- Analysis table indexes
CREATE INDEX idx_analysis_user ON analysis(user_id, created_at DESC);
CREATE INDEX idx_analysis_type ON analysis(user_id, type, created_at DESC);

-- Payment logs table indexes
CREATE INDEX idx_payment_user ON payment_logs(user_id, created_at DESC);
CREATE INDEX idx_payment_status ON payment_logs(status, created_at DESC);
CREATE INDEX idx_payment_order ON payment_logs(order_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update users.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- Service Role Only Policies
-- (All client access goes through Next.js API routes with Clerk auth)

CREATE POLICY "service_role_all_users"
  ON users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_analysis"
  ON analysis FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_payment_logs"
  ON payment_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- CRON JOBS (Configure after deployment)
-- ============================================

-- NOTE: Update URLs with your production domain before running

-- Daily Report Generation (6 AM KST = 9 PM UTC previous day)
-- SELECT cron.schedule(
--   'daily-saju-reports',
--   '0 21 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR-APP.vercel.app/api/cron/daily-report',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- Monthly Billing (1st day of month at midnight UTC)
-- SELECT cron.schedule(
--   'monthly-billing',
--   '0 0 1 * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR-APP.vercel.app/api/cron/billing',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment to insert test user
-- INSERT INTO users (id, email, plan, tests_remaining)
-- VALUES ('clerk_test_user_123', 'test@example.com', 'free', 3);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check tables
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Check RLS policies
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- Check indexes
-- SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public';

-- ============================================
-- END OF MIGRATION
-- ============================================
