# Supabase Database Setup

이 폴더에는 365일 사주 프로젝트의 Supabase 데이터베이스 설정 파일들이 포함되어 있습니다.

## 📋 목차

- [데이터베이스 구조](#데이터베이스-구조)
- [설치 방법](#설치-방법)
- [테이블 설명](#테이블-설명)
- [보안 정책](#보안-정책)
- [검증 방법](#검증-방법)

---

## 데이터베이스 구조

### 테이블

1. **users** - 사용자 계정 및 구독 상태
2. **analysis** - AI 사주 분석 결과
3. **payment_logs** - 결제 내역

### ERD

```
users (1) ──── (N) analysis
users (1) ──── (N) payment_logs
```

---

## 설치 방법

### 1. Supabase 프로젝트 생성

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인
2. "New Project" 클릭
3. 프로젝트 이름 입력 (예: `vcm-saju`)
4. Database Password 설정 (안전하게 보관)
5. Region 선택: **Northeast Asia (Seoul)**
6. "Create new project" 클릭

### 2. 마이그레이션 실행

1. Supabase Dashboard → 좌측 메뉴 **SQL Editor** 클릭
2. **"New Query"** 클릭
3. `migrations/001_initial_schema.sql` 파일 내용 복사
4. SQL Editor에 붙여넣기
5. **"Run"** 버튼 클릭 (Cmd+Enter)

### 3. 환경 변수 설정

마이그레이션 완료 후, Supabase Dashboard에서 아래 값들을 복사하여 `.env.local`에 추가:

```bash
# Supabase Dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **중요**: `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요!

---

## 테이블 설명

### users

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT | Clerk user ID (Primary Key) |
| email | TEXT | 사용자 이메일 |
| plan | TEXT | 구독 플랜 (`free`, `paid`, `cancelled`, `suspended`) |
| tests_remaining | INTEGER | 무료 체험 잔여 횟수 (기본 3회) |
| billing_key | TEXT | TossPayments 빌링키 |
| next_billing_date | DATE | 다음 결제 예정일 |
| last_daily_report_date | DATE | 마지막 일일 리포트 생성일 |

### analysis

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 분석 고유 ID |
| user_id | TEXT | 사용자 ID (FK → users.id) |
| input | JSONB | 입력 데이터 (name, birthDate, birthTime, gender) |
| output_markdown | TEXT | AI 생성 분석 결과 (Markdown) |
| model | TEXT | 사용된 AI 모델 (`gemini-2.5-flash` / `gemini-2.5-pro`) |
| type | TEXT | 분석 타입 (`free`, `daily`, `manual`) |

### payment_logs

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 로그 고유 ID |
| user_id | TEXT | 사용자 ID (FK → users.id) |
| order_id | TEXT | TossPayments 주문 ID |
| amount | INTEGER | 결제 금액 (원) |
| status | TEXT | 결제 상태 (`success`, `failed`, `cancelled`) |
| approved_at | TIMESTAMPTZ | 결제 승인 일시 |

---

## 보안 정책 (RLS)

### 아키텍처

이 프로젝트는 **Clerk 인증 + Next.js API Routes** 구조를 사용합니다:

```
Client → Clerk Auth → Next.js API Routes → Supabase (Service Role)
```

### RLS 정책

모든 테이블은 **Service Role만 접근 가능**하도록 설정되어 있습니다.

- ✅ 클라이언트는 Supabase에 직접 접근 불가
- ✅ 모든 요청은 Next.js API Routes를 거침
- ✅ API Routes에서 Clerk 세션 검증 후 Service Role Key 사용
- ✅ 추가 보안 계층으로 RLS 활성화

---

## 검증 방법

### 1. 테이블 생성 확인

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

**Expected output:**
```
 table_name
--------------
 analysis
 payment_logs
 users
```

### 2. RLS 정책 확인

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public';
```

**Expected output:**
```
 schemaname | tablename    | policyname
------------+--------------+-------------------------
 public     | users        | service_role_all_users
 public     | analysis     | service_role_all_analysis
 public     | payment_logs | service_role_all_payment_logs
```

### 3. 인덱스 확인

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 4. Trigger 확인

```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

**Expected output:**
```
 trigger_name     | event_object_table
------------------+-------------------
 set_updated_at   | users
```

---

## Cron Jobs 설정 (배포 후)

⚠️ Cron job은 **Vercel 배포 완료 후** 설정하세요.

### 1. Daily Report Generation

```sql
SELECT cron.schedule(
  'daily-saju-reports',
  '0 21 * * *', -- 9 PM UTC = 6 AM KST
  $$
  SELECT net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/daily-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 2. Monthly Billing

```sql
SELECT cron.schedule(
  'monthly-billing',
  '0 0 1 * *', -- 1st day of month at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/billing',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Cron Job 확인

```sql
SELECT * FROM cron.job;
```

---

## 트러블슈팅

### Issue: RLS 정책으로 인한 접근 거부

**Solution**: API Routes에서 **Service Role Key**를 사용하는지 확인

```typescript
// ❌ Wrong - Anon Key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // This won't work
);

// ✅ Correct - Service Role Key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use this in API routes
);
```

### Issue: Extension 에러

**Solution**: Supabase Dashboard → Database → Extensions에서 수동으로 활성화

1. `uuid-ossp` 활성화
2. `pg_cron` 활성화 (Pro plan 이상)

---

## 다음 단계

데이터베이스 설정이 완료되었으면:

1. ✅ 환경 변수 설정 (`.env.local`)
2. ⬜ Clerk 웹훅 구현 (`/api/webhooks/clerk`)
3. ⬜ Supabase 클라이언트 유틸리티 작성 (`src/lib/supabase/`)
4. ⬜ API Routes에서 DB 쿼리 테스트

---

## 참고 문서

- [Supabase Documentation](https://supabase.com/docs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Schema](/docs/prompts/database.md)
- [API Specification](/.claude/skills/saju-saas-skill/references/api-spec.md)
