-- Migration: Initial Schema for 365일 사주
-- Created: 2025-10-27
-- Description: Create users, analysis, and payment_logs tables with indexes and RLS policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: users
-- Purpose: 사용자 계정 및 구독 상태 관리
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,  -- Clerk user ID
  email TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid', 'cancelled', 'suspended')),
  tests_remaining INTEGER NOT NULL DEFAULT 3 CHECK (tests_remaining >= 0),
  
  -- Subscription info
  billing_key TEXT,
  next_billing_date DATE,
  last_daily_report_date DATE,
  
  -- Birth info for saju analysis
  name TEXT,
  birth_date DATE,
  birth_time TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_next_billing ON users(next_billing_date) WHERE plan = 'paid';
CREATE INDEX IF NOT EXISTS idx_users_daily_report ON users(last_daily_report_date) WHERE plan = 'paid';

-- Users comments
COMMENT ON TABLE users IS '사용자 계정 및 구독 상태';
COMMENT ON COLUMN users.id IS 'Clerk user ID';
COMMENT ON COLUMN users.plan IS 'free: 무료체험, paid: 구독중, cancelled: 해지됨, suspended: 결제실패';
COMMENT ON COLUMN users.tests_remaining IS '무료 체험 잔여 횟수 (초기 3회)';
COMMENT ON COLUMN users.billing_key IS 'TossPayments 정기결제 빌링키';

-- ============================================================================
-- Table: analysis
-- Purpose: AI 사주 분석 결과 저장
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Input/Output
  input JSONB NOT NULL,  -- {name, birthDate, birthTime, gender}
  output_markdown TEXT NOT NULL,
  
  -- AI model info
  model TEXT NOT NULL CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-pro')),
  type TEXT NOT NULL DEFAULT 'free' CHECK (type IN ('free', 'daily', 'manual')),
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Analysis indexes
CREATE INDEX IF NOT EXISTS idx_analysis_user ON analysis(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_type ON analysis(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_created ON analysis(created_at DESC);

-- Analysis comments
COMMENT ON TABLE analysis IS 'AI 사주 분석 결과';
COMMENT ON COLUMN analysis.input IS '입력 데이터 (JSONB): name, birthDate, birthTime, gender';
COMMENT ON COLUMN analysis.type IS 'free: 무료분석, daily: 자동일일리포트, manual: 수동요청';
COMMENT ON COLUMN analysis.model IS 'gemini-2.5-flash (무료) or gemini-2.5-pro (유료)';

-- ============================================================================
-- Table: payment_logs
-- Purpose: 결제 내역 및 이력 관리
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Payment details
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
  
  -- TossPayments info
  billing_key TEXT,
  payment_key TEXT,
  approved_at TIMESTAMPTZ,
  
  -- Error info
  error_code TEXT,
  error_message TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment logs indexes
CREATE INDEX IF NOT EXISTS idx_payment_user ON payment_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_order ON payment_logs(order_id);

-- Payment logs comments
COMMENT ON TABLE payment_logs IS '결제 내역 및 이력';
COMMENT ON COLUMN payment_logs.status IS 'success: 성공, failed: 실패, cancelled: 취소';
COMMENT ON COLUMN payment_logs.amount IS '결제 금액 (원 단위)';

-- ============================================================================
-- Triggers
-- ============================================================================

-- Auto-update updated_at on users table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "service_role_all_users" ON users;
DROP POLICY IF EXISTS "service_role_all_analysis" ON analysis;
DROP POLICY IF EXISTS "service_role_all_payment_logs" ON payment_logs;

-- ============================================================================
-- RLS Policies: Service Role Only
-- 
-- Architecture: Client → Clerk Auth → Next.js API → Supabase (Service Role)
-- 
-- - Clients do NOT access Supabase directly
-- - All DB operations go through Next.js API Routes
-- - API Routes validate Clerk session, then use Service Role Key
-- - RLS ensures only service_role can access data
-- ============================================================================

-- Users: Service role only
CREATE POLICY "service_role_all_users"
  ON users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Analysis: Service role only
CREATE POLICY "service_role_all_analysis"
  ON analysis FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Payment logs: Service role only
CREATE POLICY "service_role_all_payment_logs"
  ON payment_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
    RAISE EXCEPTION 'users table not created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'analysis') THEN
    RAISE EXCEPTION 'analysis table not created';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_logs') THEN
    RAISE EXCEPTION 'payment_logs table not created';
  END IF;
  
  RAISE NOTICE 'All tables created successfully';
END $$;

-- ============================================================================
-- Sample Data (Optional - for testing)
-- ============================================================================

-- Uncomment below to insert sample data

/*
-- Sample user
INSERT INTO users (id, email, plan, tests_remaining, name, birth_date, gender)
VALUES 
  ('test_user_001', 'test@example.com', 'free', 3, '홍길동', '1990-01-01', 'male')
ON CONFLICT (id) DO NOTHING;

-- Sample analysis
INSERT INTO analysis (user_id, input, output_markdown, model, type)
VALUES 
  (
    'test_user_001',
    '{"name": "홍길동", "birthDate": "1990-01-01", "gender": "male"}'::jsonb,
    '# 사주 분석 결과\n\n테스트 분석 내용...',
    'gemini-2.5-flash',
    'free'
  )
ON CONFLICT DO NOTHING;
*/
