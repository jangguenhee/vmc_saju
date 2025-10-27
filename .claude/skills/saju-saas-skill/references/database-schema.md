# Database Schema - 365일 사주

## Overview

This document provides the complete database schema for the 365일 사주 SaaS application using Supabase (PostgreSQL).

**Key Features:**
- Row Level Security (RLS) enabled on all tables
- Automatic timestamps with triggers
- Cron jobs for automation
- Optimized indexes for performance

---

## Tables

### 1. `users` Table

사용자 정보 및 구독 상태 관리

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  
  -- Subscription Info
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
  tests_remaining INTEGER NOT NULL DEFAULT 3,
  subscription_id TEXT,
  billing_key TEXT,
  
  -- Status Tracking
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  
  -- Daily Report Tracking
  last_daily_report_date DATE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_clerk_id ON users(clerk_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);
```

**컬럼 설명:**
- `clerk_id`: Clerk 인증 시스템의 사용자 ID
- `plan`: `free` (무료) 또는 `paid` (유료)
- `tests_remaining`: 무료 사용자의 남은 분석 횟수 (최대 3회)
- `billing_key`: TossPayments 자동결제 키
- `last_daily_report_date`: 마지막 일일 운세 생성 날짜

---

### 2. `analyses` Table

AI 분석 결과 저장

```sql
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Input Data
  birth_date DATE NOT NULL,
  birth_time TIME,
  birth_location TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  lunar_calendar BOOLEAN DEFAULT FALSE,
  
  -- Analysis Type
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('initial', 'daily')),
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- AI Output
  ai_model TEXT NOT NULL, -- 'gemini-2.5-flash' or 'gemini-2.5-pro'
  result_text TEXT NOT NULL,
  result_json JSONB,
  
  -- Metadata
  processing_time_ms INTEGER,
  token_count INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_analysis_date ON analyses(analysis_date);
CREATE INDEX idx_analyses_analysis_type ON analyses(analysis_type);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);
```

**컬럼 설명:**
- `analysis_type`: `initial` (첫 분석) 또는 `daily` (일일 운세)
- `result_json`: 구조화된 분석 결과 (점수, 조언 등)
- `ai_model`: 사용된 Gemini 모델 (무료=flash, 유료=pro)

---

### 3. `payments` Table

결제 내역 로깅

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Payment Info
  payment_key TEXT UNIQUE NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT,
  
  -- TossPayments Data
  toss_transaction_id TEXT,
  toss_response JSONB,
  
  -- Subscription Context
  subscription_period_start DATE,
  subscription_period_end DATE,
  
  -- Timestamps
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_paid_at ON payments(paid_at DESC);
```

**컬럼 설명:**
- `payment_key`: TossPayments 고유 결제 키
- `amount`: 결제 금액 (3650원 = 3,650원)
- `subscription_period_start/end`: 해당 결제가 커버하는 구독 기간

---

## Row Level Security (RLS) Policies

### Enable RLS on All Tables

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

### Users Table Policies

```sql
-- Users can read their own data
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (clerk_id = auth.uid());

-- Users can update their own data (excluding sensitive fields)
CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (clerk_id = auth.uid())
  WITH CHECK (clerk_id = auth.uid());
```

### Analyses Table Policies

```sql
-- Users can view their own analyses
CREATE POLICY "Users can view own analyses"
  ON analyses FOR SELECT
  USING (user_id IN (
    SELECT id FROM users WHERE clerk_id = auth.uid()
  ));

-- Users can insert their own analyses
CREATE POLICY "Users can create analyses"
  ON analyses FOR INSERT
  WITH CHECK (user_id IN (
    SELECT id FROM users WHERE clerk_id = auth.uid()
  ));
```

### Payments Table Policies

```sql
-- Users can view their own payment history
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (user_id IN (
    SELECT id FROM users WHERE clerk_id = auth.uid()
  ));
```

**중요**: 서버 측 작업(웹훅, 크론잡)은 Service Role Key를 사용하여 RLS를 우회합니다.

---

## Triggers

### Auto-update `updated_at` Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Cron Jobs (Supabase Extensions)

### 1. Daily Report Generation

매일 오전 6시(KST) 유료 사용자에게 일일 운세 생성

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily report generation at 6 AM KST (9 PM UTC previous day)
SELECT cron.schedule(
  'daily-saju-reports',
  '0 21 * * *', -- 9 PM UTC = 6 AM KST
  $$
  SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/cron/daily-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 2. Monthly Billing

매월 1일 자동 결제 시도

```sql
SELECT cron.schedule(
  'monthly-billing',
  '0 0 1 * *', -- 1st day of month at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/cron/billing',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## Common Queries

### 1. Get User with Plan Info

```typescript
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('clerk_id', clerkUserId)
  .single();
```

### 2. Check Free Trial Remaining

```typescript
const { data } = await supabase
  .from('users')
  .select('tests_remaining, plan')
  .eq('id', userId)
  .single();

if (data.plan === 'free' && data.tests_remaining <= 0) {
  // Redirect to subscription page
}
```

### 3. Get Analysis History

```typescript
const { data, error } = await supabase
  .from('analyses')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(10);
```

### 4. Get Today's Daily Report

```typescript
const today = new Date().toISOString().split('T')[0];

const { data } = await supabase
  .from('analyses')
  .select('*')
  .eq('user_id', userId)
  .eq('analysis_type', 'daily')
  .eq('analysis_date', today)
  .single();
```

### 5. Decrement Free Trial Count

```typescript
const { error } = await supabase
  .from('users')
  .update({ 
    tests_remaining: supabase.sql`tests_remaining - 1` 
  })
  .eq('id', userId);
```

### 6. Upgrade to Paid Plan

```typescript
const { error } = await supabase
  .from('users')
  .update({
    plan: 'paid',
    subscription_id: tossSubscriptionId,
    billing_key: tossBillingKey,
    subscription_status: 'active',
    subscription_start_date: new Date().toISOString(),
    next_billing_date: nextMonth.toISOString()
  })
  .eq('id', userId);
```

### 7. Get Users Needing Daily Reports

```typescript
// For cron job
const today = new Date().toISOString().split('T')[0];

const { data } = await supabase
  .from('users')
  .select('*')
  .eq('plan', 'paid')
  .eq('subscription_status', 'active')
  .or(`last_daily_report_date.is.null,last_daily_report_date.lt.${today}`);
```

### 8. Log Payment

```typescript
const { error } = await supabase
  .from('payments')
  .insert({
    user_id: userId,
    payment_key: tossPaymentKey,
    order_id: orderId,
    amount: 3650,
    status: 'completed',
    toss_transaction_id: tossTransactionId,
    toss_response: tossWebhookData,
    paid_at: new Date().toISOString()
  });
```

---

## Migration Script

전체 데이터베이스 설정을 한 번에 실행:

```sql
-- Run this in Supabase SQL Editor

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create Tables
-- (위의 CREATE TABLE 문들을 순서대로 실행)

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create Policies
-- (위의 CREATE POLICY 문들을 실행)

-- Create Triggers
-- (위의 CREATE TRIGGER 문들을 실행)

-- Schedule Cron Jobs
-- (위의 cron.schedule 문들을 실행, URL을 실제 도메인으로 변경)
```

---

## Checklist

데이터베이스 검토 시 확인사항:

- [ ] 모든 테이블이 생성되었는가?
- [ ] RLS가 활성화되었는가?
- [ ] RLS 정책이 올바르게 설정되었는가?
- [ ] 인덱스가 생성되었는가?
- [ ] Trigger가 작동하는가? (updated_at 자동 업데이트)
- [ ] Cron job이 스케줄되었는가?
- [ ] Service Role Key를 안전하게 보관했는가?

---

## Notes

1. **Timezone**: Supabase는 UTC를 사용합니다. KST = UTC+9
2. **Service Role Key**: 크론잡/웹훅에서 RLS 우회용으로 사용 (절대 클라이언트에 노출 금지)
3. **Anon Key**: 클라이언트에서 사용, RLS 정책 적용됨
4. **Soft Delete**: 현재는 CASCADE 삭제, 필요시 soft delete 구현 가능
