# 365일 사주 SaaS 구현 완료 요약

전체 백엔드 및 프론트엔드 시스템 구현이 완료되었습니다.

---

## 📋 구현 완료 현황

### ✅ Phase 1: 데이터베이스 설정
- **완료일**: 2025-11-08
- **구현 파일**:
  - `supabase/migrations/001_initial_schema.sql` - 전체 스키마, RLS, 인덱스, 트리거
  - `supabase/README.md` - 데이터베이스 설정 가이드

**주요 테이블**:
1. `users` - 사용자 계정, 구독 상태, 무료 체험 횟수
2. `analysis` - AI 생성 사주 분석 결과
3. `payment_logs` - 결제 트랜잭션 로그

**보안**: Service Role Key 전용 RLS 정책

---

### ✅ Phase 2: Clerk 인증 연동
- **완료일**: 2025-11-08
- **구현 파일**:
  - `src/app/api/webhooks/clerk/route.ts` - Clerk 웹훅 핸들러
  - `docs/clerk-webhook-setup.md` - Clerk 설정 가이드

**처리 이벤트**:
- `user.created`: 신규 사용자 생성 (plan='free', tests_remaining=3)
- `user.updated`: 사용자 정보 업데이트
- `user.deleted`: 사용자 삭제 (CASCADE)

**보안**: Svix 서명 검증

---

### ✅ Phase 3: AI 분석 API (Gemini)
- **완료일**: 2025-11-08
- **구현 파일**:
  - `src/lib/gemini/client.ts` - Gemini AI 클라이언트
  - `src/lib/gemini/prompts.ts` - 프롬프트 템플릿 생성기
  - `src/lib/gemini/generate.ts` - 재시도 로직, 타임아웃 처리
  - `src/app/api/analysis/create/route.ts` - 분석 생성 API
  - `src/app/api/analysis/[id]/route.ts` - 분석 조회 API
  - `docs/gemini-ai-setup.md` - Gemini 설정 가이드

**AI 모델 전략**:
- 무료 사용자: `gemini-2.0-flash-exp` (빠른 기본 분석)
- 유료 사용자: `gemini-2.0-flash-thinking-exp-1219` (상세한 일일 운세)

**기능**:
- 무료 체험 3회 제한
- 유료 사용자 일일 1회 제한
- Exponential backoff 재시도 (1s, 2s, 4s)
- 30초 타임아웃
- JSON 응답 검증

**프론트엔드 연동**:
- `/new` - 분석 생성 폼
- `/analysis/[id]` - 결과 표시 (Markdown 렌더링)

---

### ✅ Phase 4: 구독 관리 (TossPayments)
- **완료일**: 2025-11-08
- **구현 파일**:
  - `src/lib/tosspayments/client.ts` - TossPayments API 클라이언트
  - `src/app/api/subscription/status/route.ts` - 구독 상태 조회
  - `src/app/api/subscription/cancel/route.ts` - 구독 취소
  - `src/app/api/payments/success/route.ts` - 결제 성공 핸들러
  - `src/app/api/payments/fail/route.ts` - 결제 실패 핸들러
  - `src/app/api/webhooks/toss/route.ts` - TossPayments 웹훅
  - `src/app/(protected)/subscription/page.tsx` - 구독 관리 페이지
  - `docs/tosspayments-setup.md` - TossPayments 설정 가이드

**결제 플로우**:
```
사용자 → TossPayments SDK → 카드 입력 → /api/payments/success
  → TossPayments 승인 API → Supabase 업데이트 → 리디렉션
```

**웹훅 이벤트**:
- `PAYMENT_STATUS_CHANGED` (DONE/CANCELED/FAILED)
- `BILLING_KEY_DELETED`

**보안**: HMAC-SHA512 서명 검증

**패키지**: `@tosspayments/payment-sdk` 설치 완료

---

### ✅ Phase 5: Cron 자동화
- **완료일**: 2025-11-08
- **구현 파일**:
  - `src/app/api/cron/daily-report/route.ts` - 일일 운세 자동 생성
  - `src/app/api/cron/billing/route.ts` - 월간 자동 결제
  - `supabase/cron-setup.md` - Supabase Cron 설정 가이드

#### 일일 운세 자동 생성 (`/api/cron/daily-report`)
**실행 시간**: 매일 자정 KST (UTC 15:00)

**로직**:
1. `plan='paid'` 이고 `last_daily_report_date < today` 인 유저 조회
2. 유저별로 최신 분석의 생년월일 정보 가져오기
3. Gemini Pro로 일일 운세 생성
4. `analysis` 테이블에 저장 (type='daily')
5. `last_daily_report_date` 업데이트

**에러 처리**:
- 분석 정보 없는 유저 스킵
- AI 생성 실패 시 로그 기록
- 개별 유저 실패 시 다음 유저로 계속 진행

#### 월간 자동 결제 (`/api/cron/billing`)
**실행 시간**: 매일 오전 1시 KST (UTC 16:00)

**로직**:
1. `next_billing_date = today` 인 유저 조회
2. `billing_key`로 TossPayments 자동 결제 요청
3. 성공 시:
   - `next_billing_date` +1개월
   - `payment_logs` 기록 (status='success')
4. 실패 시:
   - `plan='suspended'`
   - `payment_logs` 기록 (status='failed')

**보안**: `CRON_SECRET` Bearer 토큰 인증

---

## 🗂️ 전체 파일 구조

```
vmc_saju/
├── docs/
│   ├── clerk-webhook-setup.md         # Clerk 설정 가이드
│   ├── gemini-ai-setup.md             # Gemini 설정 가이드
│   ├── tosspayments-setup.md          # TossPayments 설정 가이드
│   └── implementation-summary.md      # 이 파일
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql     # DB 스키마, RLS, 인덱스
│   ├── README.md                      # DB 설정 가이드
│   └── cron-setup.md                  # Cron 설정 가이드
├── src/
│   ├── lib/
│   │   ├── gemini/
│   │   │   ├── client.ts              # Gemini 클라이언트
│   │   │   ├── prompts.ts             # 프롬프트 생성기
│   │   │   └── generate.ts            # 재시도/타임아웃 로직
│   │   ├── tosspayments/
│   │   │   └── client.ts              # TossPayments 클라이언트
│   │   └── supabase/
│   │       └── server.ts              # Supabase 클라이언트
│   └── app/
│       ├── api/
│       │   ├── analysis/
│       │   │   ├── create/route.ts    # 분석 생성
│       │   │   └── [id]/route.ts      # 분석 조회
│       │   ├── subscription/
│       │   │   ├── status/route.ts    # 구독 상태
│       │   │   └── cancel/route.ts    # 구독 취소
│       │   ├── payments/
│       │   │   ├── success/route.ts   # 결제 성공
│       │   │   └── fail/route.ts      # 결제 실패
│       │   ├── webhooks/
│       │   │   ├── clerk/route.ts     # Clerk 웹훅
│       │   │   └── toss/route.ts      # TossPayments 웹훅
│       │   └── cron/
│       │       ├── daily-report/route.ts  # 일일 운세
│       │       └── billing/route.ts       # 자동 결제
│       └── (protected)/
│           ├── new/page.tsx           # 분석 생성 폼
│           ├── analysis/[id]/page.tsx # 분석 결과
│           └── subscription/page.tsx  # 구독 관리
└── package.json
```

---

## 🔧 환경 변수 체크리스트

`.env.local` 파일 필수 항목:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Gemini AI
GEMINI_API_KEY=AIzaSy...

# TossPayments
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...
TOSS_WEBHOOK_SECRET=...

# Cron Authorization
CRON_SECRET=<openssl rand -base64 32>
```

---

## 🚀 배포 체크리스트

### Vercel 배포

- [ ] 환경 변수 모두 설정 (`CRON_SECRET` 포함)
- [ ] 프로덕션 빌드 성공 확인
- [ ] HTTPS URL 확보

### Clerk 설정

- [ ] Webhook URL 등록: `https://yourdomain.com/api/webhooks/clerk`
- [ ] 이벤트 활성화: `user.created`, `user.updated`, `user.deleted`
- [ ] Webhook Secret 복사 → 환경 변수 등록

### TossPayments 설정

- [ ] 프로덕션 API Key 발급
- [ ] Webhook URL 등록: `https://yourdomain.com/api/webhooks/toss`
- [ ] 이벤트 활성화: `PAYMENT_STATUS_CHANGED`, `BILLING_KEY_DELETED`
- [ ] Webhook Secret 설정

### Supabase 설정

- [ ] Migration 실행 완료
- [ ] RLS 정책 활성화 확인
- [ ] Service Role Key 환경 변수 등록
- [ ] pg_net extension 활성화

### Supabase Cron 설정

```sql
-- 1. Extension 확인
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Daily Report Cron (KST 00:00)
SELECT cron.schedule(
  'daily-fortune-report',
  '0 15 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.vercel.app/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      )
    );
  $$
);

-- 3. Monthly Billing Cron (KST 01:00)
SELECT cron.schedule(
  'monthly-billing',
  '0 16 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.vercel.app/api/cron/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      )
    );
  $$
);

-- 4. 등록 확인
SELECT * FROM cron.job;
```

---

## 🧪 테스트 시나리오

### 1. 신규 사용자 가입 플로우
1. `/sign-up`에서 Google OAuth 로그인
2. Clerk 웹훅으로 `users` 테이블 생성 확인
3. `tests_remaining = 3` 확인

### 2. 무료 체험 분석
1. `/new` 페이지 접속
2. 사주 정보 입력 후 제출
3. `/api/analysis/create` 호출
4. `/analysis/[id]` 리디렉션
5. Markdown 분석 결과 확인
6. `tests_remaining = 2` 확인

### 3. 무료 체험 소진
1. 3회 분석 후 `/new` 재접속
2. "무료 체험 횟수를 모두 사용했습니다" 에러
3. `/subscription` 리디렉션

### 4. 구독 시작
1. `/subscription` 페이지 접속
2. "365일 운세 시작하기" 버튼 클릭
3. TossPayments 위젯 열림
4. 테스트 카드 입력 (`4862-0000-0000-0088`)
5. `/api/payments/success` 리디렉션
6. `plan='paid'`, `billing_key` 저장 확인
7. `payment_logs` 기록 확인
8. `/subscription?success=true` 리디렉션

### 5. 일일 운세 자동 생성
1. Cron job 실행: `GET /api/cron/daily-report`
2. 유료 사용자의 `analysis` 테이블에 `type='daily'` 레코드 생성 확인
3. `last_daily_report_date` 업데이트 확인

### 6. 월간 자동 결제
1. `next_billing_date`를 오늘로 수동 설정
2. Cron job 실행: `GET /api/cron/billing`
3. TossPayments 자동 결제 호출 확인
4. `next_billing_date` +1개월 업데이트 확인
5. `payment_logs` 기록 확인

### 7. 구독 취소
1. `/subscription` 페이지에서 "구독 해지하기" 클릭
2. `/api/subscription/cancel` 호출
3. TossPayments 빌링키 삭제 확인
4. `plan='cancelled'` 업데이트 확인
5. `next_billing_date`는 유지 (서비스 종료일까지 사용 가능)

---

## 📊 데이터베이스 모니터링 쿼리

### 사용자 통계
```sql
-- 플랜별 사용자 수
SELECT plan, COUNT(*) as count
FROM users
GROUP BY plan;

-- 무료 체험 잔여 횟수 분포
SELECT tests_remaining, COUNT(*) as count
FROM users
WHERE plan = 'free'
GROUP BY tests_remaining
ORDER BY tests_remaining DESC;
```

### 분석 통계
```sql
-- 일별 분석 생성 수
SELECT
  DATE(created_at) as date,
  type,
  COUNT(*) as count
FROM analysis
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), type
ORDER BY date DESC, type;

-- 사용자별 분석 횟수
SELECT
  user_id,
  COUNT(*) as total_analyses,
  COUNT(*) FILTER (WHERE type = 'free') as free_count,
  COUNT(*) FILTER (WHERE type = 'daily') as daily_count
FROM analysis
GROUP BY user_id
ORDER BY total_analyses DESC
LIMIT 10;
```

### 결제 통계
```sql
-- 일별 결제 현황
SELECT
  DATE(created_at) as date,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM payment_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), status
ORDER BY date DESC, status;

-- 월별 매출
SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(amount) FILTER (WHERE status = 'success') as revenue
FROM payment_logs
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;
```

---

## 🔍 트러블슈팅 가이드

### AI 분석 실패
**확인 사항**:
1. Gemini API Key 유효성
2. Gemini API 할당량 (https://makersuite.google.com)
3. 네트워크 연결
4. Vercel Function 타임아웃 (60초 설정 권장)

### 결제 실패
**확인 사항**:
1. TossPayments API Key (테스트/프로덕션)
2. TossPayments 대시보드 API 상태
3. 카드 정보 (테스트: `4862-0000-0000-0088`)
4. Webhook Secret 일치 여부

### Cron Job 미실행
**확인 사항**:
1. `pg_net` extension 활성화 (`CREATE EXTENSION IF NOT EXISTS pg_net;`)
2. Cron job 등록 확인 (`SELECT * FROM cron.job;`)
3. HTTPS URL 사용 (HTTP는 불가)
4. `CRON_SECRET` 일치 여부
5. Cron 실행 로그 (`SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`)

### Webhook 검증 실패
**Clerk**:
- Svix 서명 검증 실패 → `CLERK_WEBHOOK_SECRET` 확인

**TossPayments**:
- HMAC-SHA512 서명 검증 실패 → `TOSS_WEBHOOK_SECRET` 확인

---

## 📚 참고 문서

| 항목 | 문서 |
|------|------|
| **데이터베이스** | `supabase/README.md`, `supabase/migrations/001_initial_schema.sql` |
| **Clerk** | `docs/clerk-webhook-setup.md` |
| **Gemini** | `docs/gemini-ai-setup.md` |
| **TossPayments** | `docs/tosspayments-setup.md` |
| **Cron Jobs** | `supabase/cron-setup.md` |
| **전체 요구사항** | `docs/requirement.md` |
| **API 스펙** | `.claude/skills/saju-saas-skill/references/api-spec.md` |

---

## ✨ 완료된 기능 요약

1. ✅ **사용자 인증**: Clerk Google OAuth, 웹훅 동기화
2. ✅ **무료 체험**: 3회 AI 사주 분석
3. ✅ **AI 분석**: Gemini 2.0 Flash/Pro 모델
4. ✅ **구독 결제**: TossPayments 월 ₩3,650
5. ✅ **일일 운세**: 자동 생성 (매일 자정)
6. ✅ **자동 결제**: 빌링키 기반 월간 청구
7. ✅ **결제 실패 처리**: plan='suspended', 재결제 안내
8. ✅ **구독 취소**: 빌링키 삭제, 서비스 종료일까지 유지
9. ✅ **보안**: RLS, Webhook 서명 검증, Cron 인증

---

## 🎯 다음 단계 (추가 기능)

### 선택 사항

1. **이메일 알림 시스템**
   - 결제 성공/실패 알림
   - 일일 운세 생성 알림
   - 구독 만료 임박 알림

2. **관리자 대시보드**
   - 전체 사용자 통계
   - 결제 현황 모니터링
   - AI 분석 성공률

3. **결제 이력 페이지**
   - `/subscription/history` 구현
   - 과거 결제 내역 조회
   - 영수증 다운로드

4. **재결제 기능**
   - plan='suspended' 사용자의 재결제 플로우
   - 새로운 결제 수단 등록

5. **소셜 공유**
   - 분석 결과 이미지 생성
   - SNS 공유 버튼

6. **고급 분석**
   - 연간 운세
   - 궁합 분석
   - 특정 날짜 운세

---

## 🎉 구현 완료!

모든 핵심 기능이 구현되었습니다. 배포 체크리스트를 따라 Vercel과 Supabase에 배포하고, Cron Job을 등록하면 서비스가 완전히 자동화됩니다.
