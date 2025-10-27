# API Specification - 365일 사주

## Overview

Complete API documentation for the 365일 사주 SaaS application.

**Base URL**: `https://your-app.vercel.app`

**Tech Stack**:
- Next.js 14+ App Router
- Clerk for authentication
- Supabase for database
- TossPayments for billing
- Gemini AI for analysis

---

## Environment Variables

### Required Variables

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Server-side only!

# TossPayments
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...
TOSS_WEBHOOK_SECRET=your_webhook_secret

# Gemini AI
GEMINI_API_KEY=AIzaSy...

# Cron Job Security
CRON_SECRET=your_secure_random_string

# App URLs
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

---

## API Endpoints

### 1. Analysis Generation

#### `POST /api/analysis/generate`

새로운 사주 분석 요청

**Authentication**: Required (Clerk)

**Request Body**:
```typescript
{
  birthDate: string;      // YYYY-MM-DD
  birthTime?: string;     // HH:MM (optional)
  birthLocation?: string; // 출생 지역 (optional)
  gender: 'male' | 'female';
  lunarCalendar?: boolean; // 음력 여부 (default: false)
}
```

**Response** (Success - 200):
```typescript
{
  success: true;
  data: {
    id: string;           // Analysis UUID
    analysisType: 'initial';
    aiModel: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    resultText: string;   // 분석 결과 전문
    resultJson: {
      overall_score: number;        // 1-100
      fortune_aspects: {
        career: { score: number; advice: string; };
        wealth: { score: number; advice: string; };
        health: { score: number; advice: string; };
        relationship: { score: number; advice: string; };
      };
      lucky_elements: string[];
      warnings: string[];
    };
    createdAt: string;
  };
  testsRemaining?: number; // 무료 유저인 경우만 포함
}
```

**Response** (Free Trial Exhausted - 403):
```typescript
{
  success: false;
  error: 'FREE_TRIAL_EXHAUSTED';
  message: '무료 체험 횟수를 모두 사용했습니다. 구독을 시작해보세요!';
  testsRemaining: 0;
}
```

**Response** (Validation Error - 400):
```typescript
{
  success: false;
  error: 'VALIDATION_ERROR';
  message: '생년월일을 올바르게 입력해주세요.';
}
```

**Implementation Notes**:
- 무료 유저: `tests_remaining` 확인 후 차감
- 유료 유저: 제한 없이 분석 가능
- Gemini API 타임아웃: 30초
- 실패 시 재시도: 최대 3회 (exponential backoff)

---

### 2. Analysis History

#### `GET /api/analysis/history`

사용자의 분석 이력 조회

**Authentication**: Required (Clerk)

**Query Parameters**:
```
?limit=10          // 기본값: 10
&offset=0          // 기본값: 0
&type=initial      // 'initial' | 'daily' (optional)
```

**Response** (200):
```typescript
{
  success: true;
  data: {
    analyses: Array<{
      id: string;
      analysisType: 'initial' | 'daily';
      analysisDate: string;  // YYYY-MM-DD
      birthDate: string;
      aiModel: string;
      resultText: string;
      resultJson: object;
      createdAt: string;
    }>;
    total: number;
    hasMore: boolean;
  };
}
```

---

### 3. Get Single Analysis

#### `GET /api/analysis/[id]`

특정 분석 결과 조회

**Authentication**: Required (Clerk)

**Response** (200):
```typescript
{
  success: true;
  data: {
    id: string;
    analysisType: 'initial' | 'daily';
    birthDate: string;
    birthTime?: string;
    gender: string;
    resultText: string;
    resultJson: object;
    aiModel: string;
    createdAt: string;
  };
}
```

**Response** (Not Found - 404):
```typescript
{
  success: false;
  error: 'NOT_FOUND';
  message: '분석을 찾을 수 없습니다.';
}
```

---

### 4. Subscription Management

#### `POST /api/subscription/create`

새로운 구독 시작

**Authentication**: Required (Clerk)

**Request Body**:
```typescript
{
  paymentMethod: 'card';  // Currently only 'card' supported
}
```

**Response** (200):
```typescript
{
  success: true;
  data: {
    checkoutUrl: string;  // TossPayments checkout URL
    orderId: string;
  };
}
```

**Flow**:
1. 클라이언트가 이 API 호출
2. 서버가 TossPayments 빌링키 발급 URL 생성
3. 클라이언트가 `checkoutUrl`로 리디렉션
4. 사용자가 결제 정보 입력
5. TossPayments가 `/api/webhooks/toss`로 콜백
6. 서버가 구독 활성화 및 첫 결제 진행

---

#### `POST /api/subscription/cancel`

구독 취소

**Authentication**: Required (Clerk)

**Response** (200):
```typescript
{
  success: true;
  message: '구독이 취소되었습니다. 현재 결제 기간 종료 시까지 서비스를 이용하실 수 있습니다.';
  subscriptionEndDate: string;  // YYYY-MM-DD
}
```

**Implementation Notes**:
- 즉시 취소가 아닌 기간 종료 시 취소
- `subscription_status` → 'cancelled'
- `subscription_end_date` 유지
- 크론잡에서 자동 갱신 제외

---

#### `GET /api/subscription/status`

현재 구독 상태 조회

**Authentication**: Required (Clerk)

**Response** (200):
```typescript
{
  success: true;
  data: {
    plan: 'free' | 'paid';
    subscriptionStatus: 'active' | 'suspended' | 'cancelled';
    testsRemaining?: number;        // 무료 유저만
    subscriptionStartDate?: string; // 유료 유저만
    nextBillingDate?: string;       // 유료 유저만
    subscriptionId?: string;
  };
}
```

---

## Webhooks

### 1. Clerk Webhook

#### `POST /api/webhooks/clerk`

Clerk 사용자 이벤트 처리

**Headers**:
```
svix-id: msg_...
svix-timestamp: 1234567890
svix-signature: v1,signature_here
```

**Event Types**:

**`user.created`**:
```typescript
{
  type: 'user.created';
  data: {
    id: string;              // Clerk User ID
    email_addresses: Array<{
      email_address: string;
    }>;
    first_name?: string;
    last_name?: string;
  };
}
```

**처리 로직**:
```typescript
// Supabase에 새 사용자 생성
await supabase.from('users').insert({
  clerk_id: event.data.id,
  email: event.data.email_addresses[0].email_address,
  name: `${event.data.first_name || ''} ${event.data.last_name || ''}`.trim(),
  plan: 'free',
  tests_remaining: 3
});
```

**`user.updated`**:
```typescript
// 이메일 변경 등 업데이트
await supabase
  .from('users')
  .update({ 
    email: event.data.email_addresses[0].email_address,
    name: ... 
  })
  .eq('clerk_id', event.data.id);
```

**`user.deleted`**:
```typescript
// Soft delete 또는 hard delete
await supabase
  .from('users')
  .delete()
  .eq('clerk_id', event.data.id);
```

**Response**: Always return `200 OK` to acknowledge receipt

---

### 2. TossPayments Webhook

#### `POST /api/webhooks/toss`

TossPayments 결제 이벤트 처리

**Headers**:
```
Content-Type: application/json
X-Toss-Signature: base64_signature
```

**Signature Verification**:
```typescript
import crypto from 'crypto';

function verifyTossSignature(payload: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.TOSS_WEBHOOK_SECRET!)
    .update(payload)
    .digest('base64');
  return hash === signature;
}
```

**Event Types**:

**결제 성공** (`PAYMENT_SUCCESS`):
```typescript
{
  eventType: 'PAYMENT_SUCCESS';
  data: {
    paymentKey: string;
    orderId: string;
    amount: number;
    customerKey: string;  // user_id
    method: 'card';
  };
  createdAt: string;
}
```

**처리 로직**:
```typescript
// 1. 결제 내역 저장
await supabase.from('payments').insert({
  user_id: data.customerKey,
  payment_key: data.paymentKey,
  order_id: data.orderId,
  amount: data.amount,
  status: 'completed',
  paid_at: new Date().toISOString()
});

// 2. 구독 상태 업데이트
const nextMonth = new Date();
nextMonth.setMonth(nextMonth.getMonth() + 1);

await supabase.from('users').update({
  subscription_status: 'active',
  next_billing_date: nextMonth.toISOString()
}).eq('id', data.customerKey);
```

**결제 실패** (`PAYMENT_FAILED`):
```typescript
{
  eventType: 'PAYMENT_FAILED';
  data: {
    orderId: string;
    customerKey: string;
    failReason: string;
  };
}
```

**처리 로직**:
```typescript
// 1. 구독 일시정지
await supabase.from('users').update({
  subscription_status: 'suspended'
}).eq('id', data.customerKey);

// 2. 실패 로그
await supabase.from('payments').insert({
  user_id: data.customerKey,
  order_id: data.orderId,
  status: 'failed',
  toss_response: data
});

// 3. 이메일 알림 발송 (선택사항)
```

**빌링키 발급 성공** (`BILLING_KEY_ISSUED`):
```typescript
{
  eventType: 'BILLING_KEY_ISSUED';
  data: {
    billingKey: string;
    customerKey: string;
    cardNumber: string;  // Masked
    cardType: string;
  };
}
```

**처리 로직**:
```typescript
// 빌링키 저장 및 첫 결제 시도
await supabase.from('users').update({
  billing_key: data.billingKey,
  plan: 'paid',
  subscription_status: 'active',
  subscription_start_date: new Date().toISOString()
}).eq('id', data.customerKey);

// 첫 결제 진행
await initiateFirstPayment(data.customerKey, data.billingKey);
```

---

## Cron Jobs

### 1. Daily Report Generation

#### `POST /api/cron/daily-report`

매일 유료 사용자에게 일일 운세 생성

**Authentication**: Cron Secret

**Headers**:
```
Authorization: Bearer YOUR_CRON_SECRET
```

**Request Body**: Empty `{}`

**Response** (200):
```typescript
{
  success: true;
  processed: number;      // 처리된 사용자 수
  failed: number;         // 실패한 사용자 수
  details: Array<{
    userId: string;
    status: 'success' | 'failed';
    error?: string;
  }>;
}
```

**Implementation Logic**:
```typescript
export async function POST(req: Request) {
  // 1. Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Get users needing daily reports
  const today = new Date().toISOString().split('T')[0];
  
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('plan', 'paid')
    .eq('subscription_status', 'active')
    .or(`last_daily_report_date.is.null,last_daily_report_date.lt.${today}`);

  // 3. Generate reports
  const results = [];
  for (const user of users || []) {
    try {
      const analysis = await generateDailyAnalysis(user);
      
      await supabase.from('users').update({
        last_daily_report_date: today
      }).eq('id', user.id);
      
      results.push({ userId: user.id, status: 'success' });
    } catch (error) {
      results.push({ 
        userId: user.id, 
        status: 'failed',
        error: error.message 
      });
    }
  }

  return Response.json({
    success: true,
    processed: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    details: results
  });
}
```

**Supabase Cron Schedule**:
```sql
-- 매일 오전 6시 KST (21:00 UTC 전날)
SELECT cron.schedule(
  'daily-saju-reports',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/cron/daily-report',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
```

---

### 2. Monthly Billing

#### `POST /api/cron/billing`

매월 자동 결제 처리

**Authentication**: Cron Secret

**Headers**:
```
Authorization: Bearer YOUR_CRON_SECRET
```

**Response** (200):
```typescript
{
  success: true;
  processed: number;
  successful: number;
  failed: number;
  details: Array<{
    userId: string;
    status: 'success' | 'failed';
    paymentKey?: string;
    error?: string;
  }>;
}
```

**Implementation Logic**:
```typescript
export async function POST(req: Request) {
  // 1. Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Get users with billing due today
  const today = new Date().toISOString().split('T')[0];
  
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('plan', 'paid')
    .eq('subscription_status', 'active')
    .lte('next_billing_date', today);

  // 3. Process payments
  const results = [];
  for (const user of users || []) {
    try {
      // TossPayments 빌링키 결제
      const payment = await chargeBillingKey(
        user.billing_key,
        user.id,
        3650  // ₩3,650
      );
      
      // 다음 결제일 업데이트
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      await supabase.from('users').update({
        next_billing_date: nextMonth.toISOString().split('T')[0]
      }).eq('id', user.id);
      
      results.push({ 
        userId: user.id, 
        status: 'success',
        paymentKey: payment.paymentKey
      });
    } catch (error) {
      // 결제 실패 시 구독 일시정지
      await supabase.from('users').update({
        subscription_status: 'suspended'
      }).eq('id', user.id);
      
      results.push({ 
        userId: user.id, 
        status: 'failed',
        error: error.message 
      });
    }
  }

  return Response.json({
    success: true,
    processed: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    details: results
  });
}
```

**Supabase Cron Schedule**:
```sql
-- 매월 1일 자정 KST (전날 15:00 UTC)
SELECT cron.schedule(
  'monthly-billing',
  '0 15 28-31 * *',  -- Run on last days to catch month-end
  $$
  SELECT net.http_post(
    url := 'https://your-app.vercel.app/api/cron/billing',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
  $$
);
```

---

## Error Handling

### Standard Error Response Format

```typescript
{
  success: false;
  error: string;        // Error code
  message: string;      // User-friendly message in Korean
  details?: any;        // Additional error context
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | 입력 데이터 검증 실패 |
| `UNAUTHORIZED` | 401 | 인증 필요 |
| `FREE_TRIAL_EXHAUSTED` | 403 | 무료 체험 소진 |
| `NOT_FOUND` | 404 | 리소스를 찾을 수 없음 |
| `AI_GENERATION_FAILED` | 500 | AI 분석 생성 실패 |
| `PAYMENT_FAILED` | 500 | 결제 처리 실패 |
| `DATABASE_ERROR` | 500 | 데이터베이스 오류 |

---

## Rate Limiting

### Recommendations

```typescript
// Example using upstash/ratelimit
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
});

// Apply to analysis generation
const { success } = await ratelimit.limit(userId);
if (!success) {
  return Response.json(
    { error: 'RATE_LIMIT_EXCEEDED' },
    { status: 429 }
  );
}
```

**Suggested Limits**:
- Analysis generation: 10/min per user
- History API: 30/min per user
- Subscription APIs: 5/min per user

---

## Testing

### Test Credentials

**TossPayments Test Cards**:
```
Card Number: 4761-1234-5678-9999
Expiry: 12/25
CVC: 123
Password: 1234
```

**Clerk Test User**:
- Use `user_xxx` format for test Clerk IDs
- Or create test users in Clerk Dashboard

### Manual Testing Checklist

- [ ] New user signup creates DB entry
- [ ] Free trial decrements correctly
- [ ] Paid subscription upgrades user
- [ ] Daily report cron runs successfully
- [ ] Billing cron charges correctly
- [ ] Webhooks verify signatures
- [ ] RLS policies prevent unauthorized access

---

## Deployment Notes

### Vercel Configuration

**Environment Variables**: Add all variables to Vercel Dashboard

**Webhook URLs to Update**:
1. Clerk Dashboard → Webhooks → Add endpoint:
   ```
   https://your-app.vercel.app/api/webhooks/clerk
   ```

2. TossPayments Dashboard → Webhooks → Add endpoint:
   ```
   https://your-app.vercel.app/api/webhooks/toss
   ```

**Function Timeout**:
```javascript
// vercel.json
{
  "functions": {
    "api/analysis/generate.ts": {
      "maxDuration": 60
    },
    "api/cron/*.ts": {
      "maxDuration": 300
    }
  }
}
```

### Supabase Configuration

Update cron job URLs after deployment:
```sql
-- Update in Supabase SQL Editor
SELECT cron.unschedule('daily-saju-reports');
SELECT cron.schedule(
  'daily-saju-reports',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-production-domain.vercel.app/api/cron/daily-report',
    headers := '{"Authorization": "Bearer YOUR_ACTUAL_CRON_SECRET"}'::jsonb
  );
  $$
);
```

---

## Security Checklist

- [ ] All secrets stored in environment variables
- [ ] Webhook signatures verified
- [ ] Cron endpoints protected with secret
- [ ] RLS enabled on all tables
- [ ] Service role key never exposed to client
- [ ] HTTPS enforced on all endpoints
- [ ] CORS configured properly
- [ ] Input validation on all endpoints

---

## Monitoring & Logging

### Recommended Services
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Vercel Analytics**: Performance monitoring

### Key Metrics to Track
- Analysis generation success rate
- Payment success rate
- Daily report delivery rate
- API response times
- Cron job execution status
