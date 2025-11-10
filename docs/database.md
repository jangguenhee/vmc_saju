# Database Design
## 365일 사주 - AI 운세 구독 SaaS

**Version**: 1.0.0
**Date**: 2025-11-09
**Database**: PostgreSQL (Supabase)

---

## 1. 데이터플로우 (Data Flow)

### 1.1. 신규 가입 플로우

```
Google OAuth (Clerk)
  → user.created webhook
  → users 테이블 INSERT
      (id=clerk_user_id, plan='free', tests_remaining=3)
```

### 1.2. 무료 체험 분석 플로우

```
사용자 입력 (이름, 생년월일, 성별, 출생시간)
  → users.tests_remaining 확인 (> 0인지)
  → Gemini Flash API 호출
  → analysis 테이블 INSERT (type='free', model='gemini-2.5-flash')
  → users.tests_remaining UPDATE (차감 -1)
```

### 1.3. 구독 시작 플로우

```
TossPayments 결제
  → billing_key 발급
  → users 테이블 UPDATE
      (plan='paid', billing_key, next_billing_date=+1개월)
  → payment_logs 테이블 INSERT (status='success', amount=3650)
```

### 1.4. 일일 리포트 자동 생성 플로우 (Cron)

```
Supabase Cron (매일 06:00 KST)
  → users 테이블 SELECT
      (plan='paid' AND last_daily_report_date < today)
  → 각 유저에 대해:
      - 저장된 생년월일 조회
      - Gemini Pro API 호출
      - analysis 테이블 INSERT (type='daily', model='gemini-2.5-pro')
      - users.last_daily_report_date UPDATE (today)
```

### 1.5. 자동 정기결제 플로우 (Cron)

```
Supabase Cron (매일 00:00 KST)
  → users 테이블 SELECT
      (plan='paid' AND next_billing_date=today AND billing_key IS NOT NULL)
  → 각 유저에 대해:
      - TossPayments billing_key로 자동 청구
      - 성공 시:
          * users.next_billing_date UPDATE (+1개월)
          * payment_logs INSERT (status='success')
      - 실패 시:
          * users.plan UPDATE ('suspended')
          * payment_logs INSERT (status='failed', error_message)
```

### 1.6. 구독 해지 플로우

```
사용자 해지 요청
  → TossPayments billing_key 삭제 API 호출
  → users 테이블 UPDATE
      (plan='cancelled', billing_key=NULL)
  → next_billing_date 도래 시:
      - users.plan UPDATE ('free')
      - users.tests_remaining RESET (0)
```

---

## 2. 테이블 스키마 (PostgreSQL)

### 2.1. `users` - 사용자 계정 및 구독 정보

**목적**: Clerk 인증 사용자의 구독 상태, 무료 체험 횟수, 결제 정보, 프로필 관리

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Clerk user ID (예: `user_2a1b3c4d`) |
| `email` | TEXT | NOT NULL, UNIQUE | 사용자 이메일 |
| `plan` | TEXT | NOT NULL, DEFAULT 'free' | 플랜 상태: 'free', 'paid', 'cancelled', 'suspended' |
| `tests_remaining` | INTEGER | NOT NULL, DEFAULT 3 | 무료 체험 잔여 횟수 (free 플랜만 사용) |
| `billing_key` | TEXT | NULL | TossPayments 정기결제 billing key |
| `next_billing_date` | DATE | NULL | 다음 결제 예정일 (paid 플랜만) |
| `last_daily_report_date` | DATE | NULL | 마지막 일일 리포트 생성일 (paid 플랜만) |
| `name` | TEXT | NULL | 사용자 이름 (사주 분석용) |
| `birth_date` | DATE | NULL | 생년월일 (사주 분석용) |
| `birth_time` | TEXT | NULL | 출생시간 (사주 분석용, 예: "14:30") |
| `gender` | TEXT | NULL, CHECK (gender IN ('male', 'female')) | 성별 (사주 분석용) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 계정 생성 시각 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 마지막 업데이트 시각 |

**CHECK 제약조건**:
```sql
CHECK (plan IN ('free', 'paid', 'cancelled', 'suspended'))
CHECK (tests_remaining >= 0)
```

**트리거**:
- `updated_at` 자동 갱신 트리거

---

### 2.2. `analysis` - AI 사주 분석 결과

**목적**: Gemini AI가 생성한 사주 분석 결과 저장 (무료 체험 + 일일 리포트)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 분석 결과 고유 ID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | 사용자 ID |
| `input` | JSONB | NOT NULL | 입력 정보: `{name, birthDate, birthTime, gender}` |
| `output_markdown` | TEXT | NOT NULL | AI 생성 결과 (Markdown 형식) |
| `model` | TEXT | NOT NULL | 사용된 AI 모델: 'gemini-2.5-flash', 'gemini-2.5-pro' |
| `type` | TEXT | NOT NULL, DEFAULT 'free' | 분석 유형: 'free' (무료 체험), 'daily' (일일 리포트), 'manual' (수동 요청) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 분석 생성 시각 |

**CHECK 제약조건**:
```sql
CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-pro'))
CHECK (type IN ('free', 'daily', 'manual'))
```

**인덱스**:
```sql
CREATE INDEX idx_analysis_user_id ON analysis(user_id);
CREATE INDEX idx_analysis_created_at ON analysis(created_at DESC);
CREATE INDEX idx_analysis_user_type_date ON analysis(user_id, type, created_at DESC);
```

---

### 2.3. `payment_logs` - 결제 내역 로그

**목적**: 모든 결제 시도 및 결과 기록 (감사 추적, 디버깅)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | 로그 고유 ID |
| `user_id` | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | 사용자 ID |
| `order_id` | TEXT | NOT NULL, UNIQUE | TossPayments 주문 번호 |
| `amount` | INTEGER | NOT NULL | 결제 금액 (원 단위, 예: 3650) |
| `status` | TEXT | NOT NULL | 결제 상태: 'success', 'failed', 'cancelled' |
| `billing_key` | TEXT | NULL | 사용된 billing key (정기결제의 경우) |
| `payment_key` | TEXT | NULL | TossPayments payment key |
| `approved_at` | TIMESTAMPTZ | NULL | 승인 완료 시각 (성공 시) |
| `error_code` | TEXT | NULL | 실패 시 에러 코드 (TossPayments) |
| `error_message` | TEXT | NULL | 실패 시 에러 메시지 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 로그 생성 시각 |

**CHECK 제약조건**:
```sql
CHECK (status IN ('success', 'failed', 'cancelled'))
CHECK (amount > 0)
```

**인덱스**:
```sql
CREATE INDEX idx_payment_logs_user_id ON payment_logs(user_id);
CREATE INDEX idx_payment_logs_status ON payment_logs(status);
CREATE INDEX idx_payment_logs_created_at ON payment_logs(created_at DESC);
```

---

## 3. 관계도 (Entity Relationship)

```
┌─────────────────┐
│     users       │
│─────────────────│
│ id (PK)         │◄─────┐
│ email           │      │
│ plan            │      │ 1:N
│ tests_remaining │      │
│ billing_key     │      │
│ next_billing... │      │
│ last_daily_...  │      │
└─────────────────┘      │
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│    analysis     │ │  payment_logs   │
│─────────────────│ │─────────────────│
│ id (PK)         │ │ id (PK)         │
│ user_id (FK)    │ │ user_id (FK)    │
│ input (JSONB)   │ │ order_id        │
│ output_markdown │ │ amount          │
│ model           │ │ status          │
│ type            │ │ billing_key     │
│ created_at      │ │ approved_at     │
└─────────────────┘ └─────────────────┘
```

**관계**:
- `users` ← `analysis`: 1:N (한 사용자가 여러 분석 보유)
- `users` ← `payment_logs`: 1:N (한 사용자가 여러 결제 내역 보유)

---

## 4. 데이터 타입 선택 이유

### 4.1. `users.id = TEXT`
- **이유**: Clerk user ID는 UUID가 아닌 텍스트 형식 (`user_2a1b3c4d...`)
- **대안**: UUID로 변환 가능하지만, Clerk ID를 그대로 사용하는 것이 직관적

### 4.2. `users` 프로필 정보 vs `analysis.input`
- **users 테이블**: 사용자의 기본 프로필 정보 저장 (name, birth_date, birth_time, gender)
  - 일일 리포트 자동 생성 시 매번 조회
  - 구독자는 프로필을 한 번만 등록하면 됨
- **analysis.input**: 각 분석 요청 시점의 입력값 JSONB로 저장
  - 무료 사용자는 매번 다른 사람 정보 입력 가능
  - 프로필 변경 이력 추적 가능

### 4.3. `analysis.input = JSONB`
- **이유**: 생년월일, 출생시간 등 비정형 데이터는 스키마 변경 없이 유연하게 저장
- **장점**: 추후 음력 지원, 추가 입력값 확장 용이
- **쿼리**: GIN 인덱스로 JSONB 내부 필드 검색 가능

### 4.4. `payment_logs.amount = INTEGER`
- **이유**: 원화는 소수점 없음, INTEGER로 충분
- **범위**: PostgreSQL INTEGER는 최대 2,147,483,647원 (약 21억원)

### 4.5. `next_billing_date = DATE`
- **이유**: 결제는 날짜 단위로 관리 (시간 불필요)
- **시간대**: KST 기준으로 Cron job이 처리

---

## 5. 인덱스 전략

### 5.1. 필수 인덱스

```sql
-- users 테이블
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_next_billing ON users(next_billing_date) WHERE plan = 'paid';
CREATE INDEX idx_users_daily_report ON users(last_daily_report_date) WHERE plan = 'paid';

-- analysis 테이블
CREATE INDEX idx_analysis_user ON analysis(user_id, created_at DESC);
CREATE INDEX idx_analysis_type ON analysis(user_id, type, created_at DESC);

-- payment_logs 테이블
CREATE INDEX idx_payment_user ON payment_logs(user_id, created_at DESC);
CREATE INDEX idx_payment_status ON payment_logs(status, created_at DESC);
CREATE INDEX idx_payment_order ON payment_logs(order_id);
```

**인덱스 설명**:
- `idx_users_plan`: 플랜별 사용자 조회 최적화
- `idx_users_next_billing`: 정기결제 대상 조회 (Cron)
- `idx_users_daily_report`: 일일 리포트 생성 대상 조회 (Cron)
- `idx_analysis_user`: 사용자별 분석 히스토리 조회
- `idx_analysis_type`: 분석 유형별 조회 (오늘 생성 여부 확인)
- `idx_payment_user`: 사용자별 결제 내역 조회
- `idx_payment_status`: 결제 상태별 조회 (실패 추적)
- `idx_payment_order`: 주문번호로 빠른 조회

---

## 6. Row Level Security (RLS) 정책

### 6.1. Service Role 전용 접근

**전략**: 클라이언트는 Supabase에 직접 접근하지 않음. 모든 DB 작업은 Next.js API 라우트가 Service Role Key로 수행.

```sql
-- users 테이블
CREATE POLICY "service_role_all_users"
  ON users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- analysis 테이블
CREATE POLICY "service_role_all_analysis"
  ON analysis FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- payment_logs 테이블
CREATE POLICY "service_role_all_payment_logs"
  ON payment_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**RLS 활성화**:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;
```

---

## 7. 트리거 (Triggers)

### 7.1. `updated_at` 자동 갱신

```sql
-- Function 생성
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger 적용
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 8. 주요 쿼리 패턴

### 8.1. 무료 체험 잔여 확인

```sql
SELECT tests_remaining
FROM users
WHERE id = $user_id AND plan = 'free';
```

### 8.2. 오늘 일일 리포트 생성 여부 확인

```sql
SELECT * FROM analysis
WHERE user_id = $user_id
  AND type = 'daily'
  AND DATE(created_at) = CURRENT_DATE;
```

### 8.3. Cron: 일일 리포트 생성 대상 조회

```sql
SELECT * FROM users
WHERE plan = 'paid'
  AND (last_daily_report_date IS NULL
       OR last_daily_report_date < CURRENT_DATE);
```

### 8.4. Cron: 정기결제 대상 조회

```sql
SELECT * FROM users
WHERE plan = 'paid'
  AND next_billing_date = CURRENT_DATE
  AND billing_key IS NOT NULL;
```

### 8.5. 사용자 분석 히스토리 조회

```sql
SELECT * FROM analysis
WHERE user_id = $user_id
ORDER BY created_at DESC
LIMIT 10;
```

### 8.6. 결제 내역 조회

```sql
SELECT * FROM payment_logs
WHERE user_id = $user_id
ORDER BY created_at DESC;
```

---

## 9. 데이터 보관 정책

### 9.1. 회원 탈퇴 시

```sql
-- Clerk user.deleted 이벤트 수신 시
-- CASCADE로 analysis, payment_logs 자동 삭제
DELETE FROM users WHERE id = $user_id;
```

### 9.2. 데이터 보관 기간

- **users**: 탈퇴 후 30일 유예 → 완전 삭제
- **analysis**: 사용자 삭제 시 CASCADE 삭제
- **payment_logs**: 법적 의무 보관 (5년) → soft delete 고려

---

## 10. 샘플 데이터

### 10.1. users

| id | email | plan | tests_remaining | name | birth_date | gender | billing_key | next_billing_date |
|----|-------|------|-----------------|------|------------|--------|-------------|-------------------|
| user_abc123 | user1@example.com | free | 2 | NULL | NULL | NULL | NULL | NULL |
| user_def456 | user2@example.com | paid | 0 | 김철수 | 1990-05-15 | male | bk_xyz789 | 2025-12-08 |
| user_ghi789 | user3@example.com | cancelled | 0 | 이영희 | 1985-03-20 | female | NULL | 2025-11-15 |

### 10.2. analysis

| id | user_id | input | output_markdown | model | type | created_at |
|----|---------|-------|-----------------|-------|------|------------|
| uuid1 | user_abc123 | `{name: "홍길동", ...}` | "# 사주 분석..." | gemini-2.5-flash | free | 2025-11-08 10:30 |
| uuid2 | user_def456 | `{name: "김철수", ...}` | "# 오늘의 사주..." | gemini-2.5-pro | daily | 2025-11-08 06:00 |

### 10.3. payment_logs

| id | user_id | order_id | amount | status | billing_key | approved_at | created_at |
|----|---------|----------|--------|--------|-------------|-------------|------------|
| uuid3 | user_def456 | order_123 | 3650 | success | bk_xyz789 | 2025-10-08 14:20 | 2025-10-08 14:19 |
| uuid4 | user_ghi789 | order_456 | 3650 | failed | bk_abc111 | NULL | 2025-11-01 00:05 |

---

## 11. Migration 파일 위치

데이터베이스 스키마 생성 SQL:
- **경로**: `/supabase/migrations/001_initial_schema.sql`
- **내용**: 테이블 생성, 인덱스, RLS 정책, 트리거 포함

---

## 12. 데이터베이스 다이어그램

```
┌────────────────────────────────────┐
│           users (계정)             │
├────────────────────────────────────┤
│ id: TEXT (PK)                      │
│ email: TEXT (UNIQUE)               │
│ plan: TEXT (free/paid/...)         │
│ tests_remaining: INTEGER           │
│ billing_key: TEXT (nullable)       │
│ next_billing_date: DATE (nullable) │
│ last_daily_report_date: DATE       │
│ created_at, updated_at             │
└─────────────┬──────────────────────┘
              │
              │ 1
              │
              │ N
    ┌─────────┴──────────┬────────────────────┐
    │                    │                    │
┌───▼──────────────┐ ┌───▼─────────────┐     │
│   analysis       │ │  payment_logs   │     │
├──────────────────┤ ├─────────────────┤     │
│ id: UUID (PK)    │ │ id: UUID (PK)   │     │
│ user_id: TEXT    │ │ user_id: TEXT   │     │
│ input: JSONB     │ │ order_id: TEXT  │     │
│ output_markdown  │ │ amount: INTEGER │     │
│ model: TEXT      │ │ status: TEXT    │     │
│ type: TEXT       │ │ billing_key     │     │
│ created_at       │ │ approved_at     │     │
└──────────────────┘ └─────────────────┘     │
                                              │
                     ┌────────────────────────┘
                     │
              Clerk Webhook
                (user.created)
```

---

## 13. 확장 고려사항 (V2.0)

향후 추가 가능한 테이블:

### 13.1. `user_profiles` (선택)
- 출생지 정보 (위도/경도)
- 음력 생일 지원
- 프로필 사진

### 13.2. `notifications` (이메일 알림)
- 결제 실패 알림 기록
- 일일 리포트 알림 기록

### 13.3. `referrals` (추천 프로그램)
- 추천인 코드
- 리워드 지급 내역

---

**문서 작성 완료**: 2025-11-09
**작성자**: AI Assistant (based on PRD & User Flow)
