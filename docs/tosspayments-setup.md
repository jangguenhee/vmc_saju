# TossPayments 통합 설정 가이드

TossPayments를 사용하여 월 구독 결제 시스템을 구현하는 방법을 안내합니다.

---

## 1. 필수 조건

- ✅ TossPayments 개발자 계정
- ✅ 상점 ID (MID) 및 시크릿 키 발급
- ✅ Supabase 데이터베이스 설정 완료
- ✅ Clerk 인증 설정 완료

---

## 2. TossPayments API Key 발급

### Step 1: TossPayments 개발자센터 접속

1. https://developers.tosspayments.com/ 방문
2. 계정 생성 및 로그인
3. **내 개발 정보** 메뉴 클릭

### Step 2: API Key 생성

**테스트 환경**:
- Client Key: `test_ck_...`
- Secret Key: `test_sk_...`

**프로덕션 환경**:
- Client Key: `live_ck_...`
- Secret Key: `live_sk_...`

### Step 3: 환경 변수 설정

`.env.local` 파일에 추가:

```bash
# TossPayments API Keys (Test)
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_XXXXXXXXXXXXXXXXXXXXXXXXXX
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXXXXXXXXXXXXXXXX
TOSS_WEBHOOK_SECRET=your_webhook_secret_here
```

⚠️ **주의**:
- `TOSS_SECRET_KEY`는 서버 사이드 전용 (NEXT_PUBLIC 접두사 없음)
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`는 클라이언트에서 사용 가능
- Webhook Secret은 TossPayments 대시보드에서 설정 가능

---

## 3. 구현 구조

### 파일 구조

```
src/
├── lib/tosspayments/
│   └── client.ts              # TossPayments API 클라이언트
├── app/api/
│   ├── payments/
│   │   ├── success/route.ts   # 결제 성공 핸들러
│   │   └── fail/route.ts      # 결제 실패 핸들러
│   ├── subscription/
│   │   ├── status/route.ts    # 구독 상태 조회
│   │   └── cancel/route.ts    # 구독 취소
│   └── webhooks/
│       └── toss/route.ts      # TossPayments 웹훅
└── app/(protected)/
    └── subscription/page.tsx  # 구독 관리 페이지
```

### 결제 흐름

```
사용자 구독 버튼 클릭
  ↓
TossPayments SDK 로드 (클라이언트)
  ↓
결제 위젯 열기 (requestPayment)
  ↓
사용자 카드 정보 입력
  ↓
결제 성공 → /api/payments/success
  ↓
TossPayments 승인 요청 (approvePayment)
  ↓
Supabase: plan='paid', billing_key 저장
  ↓
/subscription?success=true 리디렉션
```

---

## 4. API 엔드포인트

### POST /api/subscription/status

구독 상태 조회

**Response**:
```json
{
  "success": true,
  "data": {
    "plan": "paid",
    "testsRemaining": 0,
    "billingKey": "********",
    "nextBillingDate": "2025-12-08",
    "lastDailyReportDate": "2025-11-08"
  }
}
```

### POST /api/subscription/cancel

구독 취소

**Response**:
```json
{
  "success": true,
  "message": "구독이 취소되었습니다. 현재 결제 기간 종료 시까지 서비스를 이용하실 수 있습니다.",
  "subscriptionEndDate": "2025-12-08"
}
```

### GET /api/payments/success

결제 승인 핸들러 (TossPayments에서 리디렉션)

**Query Parameters**:
- `paymentKey`: TossPayments 결제 키
- `orderId`: 주문 번호 (user_id_timestamp)
- `amount`: 결제 금액 (3650)

**Flow**:
1. TossPayments API로 결제 승인 요청
2. `users` 테이블 업데이트 (plan='paid', billing_key, next_billing_date)
3. `payment_logs` 테이블에 로그 저장
4. `/subscription?success=true` 리디렉션

### GET /api/payments/fail

결제 실패 핸들러

**Query Parameters**:
- `code`: 에러 코드
- `message`: 에러 메시지
- `orderId`: 주문 번호

**Flow**:
1. 실패 로그 저장
2. `/subscription?error=payment_failed` 리디렉션

### POST /api/webhooks/toss

TossPayments 웹훅 핸들러

**Event Types**:
- `PAYMENT_STATUS_CHANGED`: 결제 상태 변경
  - `DONE`: 결제 성공 → plan='paid'
  - `CANCELED`: 결제 취소 → status='cancelled'
  - `FAILED`: 결제 실패 → plan='suspended'
- `BILLING_KEY_DELETED`: 빌링키 삭제 → plan='cancelled'

**Signature Verification**:
```typescript
const hmac = crypto.createHmac('sha512', TOSS_WEBHOOK_SECRET);
const digest = hmac.update(payload).digest('base64');
return digest === signature;
```

---

## 5. 프론트엔드 통합

### 구독 페이지 (`/subscription`)

**TossPayments SDK 사용**:
```typescript
import { loadTossPayments } from '@tosspayments/payment-sdk';

const handleSubscribe = async () => {
  const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);

  await tossPayments.requestPayment('카드', {
    amount: 3650,
    orderId: `${userId}_${Date.now()}`,
    orderName: '365일 사주 월 구독',
    successUrl: `${origin}/api/payments/success`,
    failUrl: `${origin}/api/payments/fail`,
    customerName: '고객',
  });
};
```

**구독 취소**:
```typescript
const handleCancel = async () => {
  const response = await fetch('/api/subscription/cancel', {
    method: 'POST',
  });

  const data = await response.json();
  if (data.success) {
    alert(data.message);
  }
};
```

---

## 6. 빌링키 자동 결제

### 월간 자동 청구 (Cron)

**구현 예정**: `/api/cron/billing`

**Flow**:
1. `next_billing_date = today` 인 유저 조회
2. 각 유저의 `billing_key`로 자동 결제 요청
3. 성공 시: `next_billing_date` +1개월, `payment_logs` 기록
4. 실패 시: `plan='suspended'`, 이메일 알림

**Supabase Cron 설정**:
```sql
SELECT cron.schedule(
  'monthly-billing',
  '0 0 * * *', -- 매일 자정
  $$
  SELECT net.http_post(
    url := 'https://yourdomain.com/api/cron/billing',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

---

## 7. 테스트 방법

### 로컬 테스트

1. **개발 서버 실행**:
```bash
npm run dev
```

2. **TossPayments 테스트 카드 사용**:
   - 카드 번호: `4862-0000-0000-0088`
   - 유효기간: `12/30`
   - CVC: `000`
   - 비밀번호 앞 2자리: `00`

3. **결제 플로우 테스트**:
   - `/subscription` 접속
   - "365일 운세 시작하기" 클릭
   - 테스트 카드 정보 입력
   - 결제 성공 확인

4. **구독 취소 테스트**:
   - "구독 해지하기" 클릭
   - 상태가 'cancelled'로 변경 확인

### 데이터베이스 확인

```sql
-- 유저 구독 상태 확인
SELECT id, email, plan, billing_key, next_billing_date
FROM users
ORDER BY created_at DESC;

-- 결제 로그 확인
SELECT user_id, order_id, amount, status, approved_at
FROM payment_logs
ORDER BY created_at DESC;
```

---

## 8. 웹훅 설정

### ngrok으로 로컬 테스트

```bash
# ngrok 설치
brew install ngrok

# 포트 3000 포워딩
ngrok http 3000

# 출력된 HTTPS URL을 TossPayments 대시보드에 등록
# 예: https://abc123.ngrok.io/api/webhooks/toss
```

### Vercel 배포 후

TossPayments 개발자센터 → 웹훅 설정:
- URL: `https://yourdomain.com/api/webhooks/toss`
- 이벤트: `PAYMENT_STATUS_CHANGED`, `BILLING_KEY_DELETED`

---

## 9. 에러 핸들링

### 결제 실패 시나리오

| 에러 코드 | 원인 | 해결 방법 |
|----------|------|-----------|
| `INVALID_CARD_COMPANY` | 지원하지 않는 카드사 | 다른 카드 사용 |
| `INSUFFICIENT_FUNDS` | 잔액 부족 | 잔액 확인 후 재시도 |
| `EXCEED_MAX_DAILY_PAYMENT_COUNT` | 일일 결제 한도 초과 | 다음 날 재시도 |
| `COMMON_ERROR` | 일반 오류 | 재시도 또는 고객센터 문의 |

### 빌링키 결제 실패

**자동 처리**:
1. 웹훅으로 `PAYMENT_STATUS_CHANGED` (status: FAILED) 수신
2. `users.plan`을 'suspended'로 업데이트
3. 이메일 알림 발송 (TODO: 구현 필요)
4. 사용자는 `/subscription`에서 재결제 가능

---

## 10. 보안 고려사항

### HTTPS 필수
- TossPayments 콜백 및 웹훅은 HTTPS만 지원
- 로컬 테스트 시 ngrok 사용

### 시크릿 키 보호
- `TOSS_SECRET_KEY`는 절대 클라이언트에 노출하지 마세요
- 서버 사이드 API 라우트에서만 사용

### 웹훅 서명 검증
- 모든 웹훅 요청에 대해 HMAC-SHA512 서명 검증 필수
- 서명이 올바르지 않으면 401 Unauthorized 반환

### 금액 검증
- 클라이언트에서 전송한 금액과 서버 검증 필수
- `approvePayment` 호출 시 금액 불일치 시 실패

---

## 11. 트러블슈팅

### ❌ Missing TOSS_CLIENT_KEY

**원인**: 환경 변수 미설정

**해결**:
```bash
# .env.local 확인
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...

# 개발 서버 재시작
npm run dev
```

### ❌ Payment approval failed

**원인**: TossPayments API 호출 실패

**해결**:
1. `TOSS_SECRET_KEY` 유효성 확인
2. 네트워크 연결 확인
3. TossPayments 대시보드에서 API 상태 확인

### ❌ Invalid webhook signature

**원인**: Webhook Secret 불일치

**해결**:
1. TossPayments 대시보드에서 Webhook Secret 확인
2. `.env.local`의 `TOSS_WEBHOOK_SECRET` 업데이트

### ❌ User update failed

**원인**: 데이터베이스 연결 또는 권한 문제

**해결**:
1. Supabase Service Role Key 확인
2. RLS 정책 확인 (Service Role 권한)
3. 데이터베이스 연결 상태 확인

---

## 12. 다음 단계

구독 관리 API가 정상 작동하면:

- ✅ 1단계: 데이터베이스 설정 완료
- ✅ 2단계: Clerk 웹훅 연동 완료
- ✅ 3단계: AI 분석 API 구현 완료
- ✅ 4단계: 구독 관리 API 구현 완료
- ⬜ 5단계: Cron 자동화 구현 (일일 리포트, 자동 결제)
- ⬜ 6단계: 이메일 알림 시스템
- ⬜ 7단계: 결제 이력 페이지

---

## 13. 참고 문서

- [TossPayments 개발자 문서](https://docs.tosspayments.com/)
- [결제 승인 API](https://docs.tosspayments.com/reference#결제-승인)
- [빌링키 발급](https://docs.tosspayments.com/reference#빌링키-발급)
- [웹훅 가이드](https://docs.tosspayments.com/guides/webhook)
- [에러 코드 목록](https://docs.tosspayments.com/reference/error-codes)
