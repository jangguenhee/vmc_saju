# Database Schema
## 365일 사주 - AI 운세 구독 SaaS

**Version**: 1.0.0  
**Date**: 2025-10-27  
**Database**: PostgreSQL (Supabase)  
**Status**: Ready for Migration

---

## Data Flow Overview

### Core Data Flows

```
1. User Registration
   Clerk webhook → users (INSERT)

2. Free Trial Analysis
   User input → Gemini Flash → analysis (INSERT) → users.tests_remaining (UPDATE -1)

3. Subscription Payment
   TossPayments → users.billing_key (UPDATE) → payment_logs (INSERT)

4. Daily Report Generation
   Cron → users (SELECT plan='paid') → Gemini Pro → analysis (INSERT) → users.last_daily_report_date (UPDATE)

5. Recurring Billing
   Cron → users (SELECT next_billing_date=today) → TossPayments → payment_logs (INSERT) → users.next_billing_date (UPDATE)
```

---

## Entity Relationship

```
users (1) ──── (N) analysis
users (1) ──── (N) payment_logs
```

- 한 사용자는 여러 분석 결과를 가질 수 있음
- 한 사용자는 여러 결제 내역을 가질 수 있음

---

## Tables

### 1. users

사용자 계정 및 구독 상태 관리

**Purpose**: Clerk 인증 사용자 정보 저장, 플랜 상태 관리, 구독 정보 저장

**Source**: 
- Feature 003 (신규 회원 자동 등록)
- Feature 004 (대시보드 진입)
- Feature 005 (AI 사주 분석 - 무료)
- Feature 009 (구독 시작)
- Feature 010 (구독 관리)

| Column | Type | Constraints | Description | Source |
|--------|------|-------------|-------------|--------|
| id | TEXT | PRIMARY KEY | Clerk user ID | Feature 003 |
| email | TEXT | NOT NULL UNIQUE | 사용자 이메일 | Feature 003 |
| plan | TEXT | NOT NULL DEFAULT 'free' | 구독 플랜 상태 | Feature 003, 009 |
| tests_remaining | INTEGER | NOT NULL DEFAULT 3 | 무료 체험 잔여 횟수 | Feature 003, 005 |
| billing_key | TEXT | NULL | TossPayments 정기결제 키 | Feature 009 |
| next_billing_date | DATE | NULL | 다음 결제 예정일 | Feature 009, 012 |
| last_daily_report_date | DATE | NULL | 마지막 일일 리포트 생성일 | Feature 011 |
| name | TEXT | NULL | 사용자 이름 (사주 분석용) | Feature 005, 006 |
| birth_date | DATE | NULL | 생년월일 (사주 분석용) | Feature 005, 006 |
| birth_time | TEXT | NULL | 출생시간 (선택) | Feature 005, 006 |
| gender | TEXT | NULL CHECK (gender IN ('male', 'female')) | 성별 | Feature 005, 006 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 생성일시 | Feature 003 |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 수정일시 | Auto |

**Constraints**:
```sql
CHECK (plan IN ('free', 'paid', 'cancelled', 'suspended'))
CHECK (gender IN ('male', 'female'))
CHECK (tests_remaining >= 0)
```

**Indexes**:
```sql
CREATE INDEX idx_users_plan ON users(plan);
CREATE INDEX idx_users_next_billing ON users(next_billing_date) WHERE plan = 'paid';
CREATE INDEX idx_users_daily_report ON users(last_daily_report_date) WHERE plan = 'paid';
```

**Business Rules**:
- `plan='free'`: 초기 가입 상태, tests_remaining=3
- `plan='paid'`: 유료 구독 활성, billing_key 존재
- `plan='cancelled'`: 해지 요청됨, next_billing_date까지 유효
- `plan='suspended'`: 결제 실패, 서비스 일시 중단
- billing_key는 plan='paid'일 때만 NOT NULL
- next_billing_date는 구독 시작 시 +1개월로 설정

---

### 2. analysis

AI 사주 분석 결과 저장

**Purpose**: Gemini AI 생성 사주 분석 내용 보관, 히스토리 관리

**Source**:
- Feature 005 (AI 사주 분석 - 무료)
- Feature 006 (AI 사주 분석 - 구독자)
- Feature 007 (분석 결과 상세 보기)
- Feature 011 (매일 자동 리포트)

| Column | Type | Constraints | Description | Source |
|--------|------|-------------|-------------|--------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | 분석 고유 ID | Auto |
| user_id | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE | 사용자 ID | Feature 005, 006 |
| input | JSONB | NOT NULL | 입력 데이터 (name, birthDate, birthTime, gender) | Feature 005 |
| output_markdown | TEXT | NOT NULL | AI 생성 분석 결과 (Markdown) | Feature 005, 006 |
| model | TEXT | NOT NULL | 사용된 AI 모델 | Feature 005, 006 |
| type | TEXT | NOT NULL DEFAULT 'free' | 분석 타입 | Feature 005, 006, 011 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 생성일시 | Auto |

**Constraints**:
```sql
CHECK (model IN ('gemini-2.5-flash', 'gemini-2.5-pro'))
CHECK (type IN ('free', 'daily', 'manual'))
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

**Indexes**:
```sql
CREATE INDEX idx_analysis_user ON analysis(user_id, created_at DESC);
CREATE INDEX idx_analysis_type ON analysis(user_id, type, created_at DESC);
```

**JSONB input Structure**:
```json
{
  "name": "홍길동",
  "birthDate": "1990-01-01",
  "birthTime": "14:00",
  "gender": "male"
}
```

**Business Rules**:
- `type='free'`: 무료 체험 분석 (gemini-2.5-flash)
- `type='daily'`: 자동 생성 일일 리포트 (gemini-2.5-pro)
- `type='manual'`: 유료 사용자 수동 요청 (gemini-2.5-pro)
- 무료 사용자는 type='free'만 생성 가능
- 유료 사용자는 type='daily' 또는 'manual' 생성 가능
- 하루 1회 type='daily' 제한 (Feature 006)

---

### 3. payment_logs

결제 내역 및 이력 관리

**Purpose**: TossPayments 결제 트랜잭션 기록, 감사 로그

**Source**:
- Feature 009 (구독 시작)
- Feature 010 (구독 관리)
- Feature 012 (정기결제 자동화)

| Column | Type | Constraints | Description | Source |
|--------|------|-------------|-------------|--------|
| id | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | 로그 고유 ID | Auto |
| user_id | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE | 사용자 ID | Feature 009 |
| order_id | TEXT | NOT NULL UNIQUE | TossPayments 주문 ID | Feature 009 |
| amount | INTEGER | NOT NULL | 결제 금액 (원) | Feature 009 |
| status | TEXT | NOT NULL | 결제 상태 | Feature 009, 012 |
| billing_key | TEXT | NULL | TossPayments 빌링키 | Feature 009 |
| payment_key | TEXT | NULL | TossPayments 결제키 | Feature 009 |
| approved_at | TIMESTAMPTZ | NULL | 승인 일시 | Feature 009 |
| error_code | TEXT | NULL | 에러 코드 (실패 시) | Feature 012 |
| error_message | TEXT | NULL | 에러 메시지 (실패 시) | Feature 012 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 생성일시 | Auto |

**Constraints**:
```sql
CHECK (status IN ('success', 'failed', 'cancelled'))
CHECK (amount > 0)
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

**Indexes**:
```sql
CREATE INDEX idx_payment_user ON payment_logs(user_id, created_at DESC);
CREATE INDEX idx_payment_status ON payment_logs(status, created_at DESC);
CREATE INDEX idx_payment_order ON payment_logs(order_id);
```

**Business Rules**:
- `status='success'`: 결제 성공
- `status='failed'`: 결제 실패, error_code/error_message 필수
- `status='cancelled'`: 결제 취소 (환불)
- 정기결제는 amount=3650 고정
- order_id는 TossPayments에서 생성한 고유 값

---

## Row Level Security (RLS)

### Architecture Note

이 프로젝트는 **Clerk 인증**을 사용하며, 클라이언트는 Supabase에 직접 접근하지 않습니다.

```
Client → Clerk Auth → Next.js API Routes → Supabase (Service Role Key)
```

**Security Model:**
- ✅ Clerk가 사용자 인증 처리
- ✅ Next.js API Routes에서 Clerk 세션 검증
- ✅ API Routes가 Service Role Key로 Supabase 접근
- ✅ RLS는 Service Role만 허용 (추가 보안 계층)

### RLS Policies

**모든 테이블: Service Role 전용**

```sql
-- Users table
CREATE POLICY "service_role_all_users"
  ON users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Analysis table
CREATE POLICY "service_role_all_analysis"
  ON analysis FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Payment logs table
CREATE POLICY "service_role_all_payment_logs"
  ON payment_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

### Authorization Flow

```typescript
// Next.js API Route 예시
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  // 1. Clerk 세션 검증
  const { userId } = auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Service Role로 Supabase 접근
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Service Role Key
  );

  // 3. 사용자 본인 데이터만 조회 (애플리케이션 레벨 검증)
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId) // Clerk userId로 필터링
    .single();

  return Response.json(data);
}
```

### Why This Approach?

1. **Clerk + Supabase Auth 충돌 방지**
   - Clerk의 user ID는 TEXT 타입
   - Supabase auth.uid()는 UUID 타입
   - 타입 불일치 문제 회피

2. **중앙화된 권한 관리**
   - 모든 권한 검증이 API Routes에서 수행
   - 일관된 보안 정책 적용 가능

3. **유연성**
   - 복잡한 비즈니스 로직 구현 가능
   - Cross-table 권한 검증 용이

4. **명확한 보안 경계**
   - 클라이언트는 절대 Service Role Key 접근 불가
   - API가 유일한 진입점

---

## Triggers

### users.updated_at 자동 갱신

```sql
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
```

---

## Sample Queries

### 대시보드 데이터 조회 (Feature 004)

```sql
-- 사용자 정보 + 최근 분석 10개
SELECT 
  u.*,
  COUNT(a.id) as total_analyses,
  MAX(a.created_at) as last_analysis_date
FROM users u
LEFT JOIN analysis a ON a.user_id = u.id
WHERE u.id = $1
GROUP BY u.id;

-- 분석 히스토리
SELECT 
  id,
  input->>'name' as name,
  input->>'birthDate' as birth_date,
  type,
  model,
  created_at
FROM analysis
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

### 무료 체험 잔여 확인 (Feature 005)

```sql
SELECT tests_remaining, plan
FROM users
WHERE id = $1;
```

### 오늘 분석 이미 생성 여부 확인 (Feature 006)

```sql
SELECT * FROM analysis
WHERE user_id = $1
  AND type = 'daily'
  AND DATE(created_at) = CURRENT_DATE;
```

### 오늘 결제 대상 조회 (Feature 012)

```sql
SELECT id, email, billing_key, next_billing_date
FROM users
WHERE plan = 'paid'
  AND next_billing_date = CURRENT_DATE
  AND billing_key IS NOT NULL;
```

### 일일 리포트 생성 대상 조회 (Feature 011)

```sql
SELECT id, name, birth_date, birth_time, gender
FROM users
WHERE plan = 'paid'
  AND (
    last_daily_report_date IS NULL 
    OR last_daily_report_date < CURRENT_DATE
  );
```

### 결제 내역 조회 (Feature 010)

```sql
SELECT 
  order_id,
  amount,
  status,
  approved_at,
  created_at
FROM payment_logs
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20;
```

---

## Data Volume Estimates

### 초기 6개월 예상치

| Table | Rows | Growth Rate | Storage |
|-------|------|-------------|---------|
| users | 1,000 | +500/month | ~200 KB |
| analysis | 15,000 | +7,500/month | ~30 MB |
| payment_logs | 6,000 | +3,000/month | ~1 MB |

**Total**: ~31 MB (6개월)

### 분석 결과 크기 추정

- 무료 (Flash): 평균 800자 → ~1.6 KB
- 유료 (Pro): 평균 2,000자 → ~4 KB
- 일일 리포트: 유료 사용자 × 30일 = 대부분의 volume

---

## Backup & Maintenance

### Supabase 자동 백업

- **Frequency**: 24시간마다
- **Retention**: 7일 (무료 플랜)
- **Point-in-time Recovery**: 사용 가능

### Vacuum & Analyze

```sql
-- 주기적으로 실행 (Supabase 자동)
VACUUM ANALYZE users;
VACUUM ANALYZE analysis;
VACUUM ANALYZE payment_logs;
```

---

## Migration Strategy

### Phase 1: 테이블 생성
1. users 테이블 생성
2. analysis 테이블 생성
3. payment_logs 테이블 생성

### Phase 2: 인덱스 생성
1. 필수 인덱스 (PK, FK)
2. 성능 인덱스 (조회 최적화)

### Phase 3: RLS 설정
1. RLS 활성화
2. Policy 생성
3. 권한 테스트

### Phase 4: Trigger 설정
1. updated_at 자동 갱신
2. 기타 비즈니스 로직 트리거

