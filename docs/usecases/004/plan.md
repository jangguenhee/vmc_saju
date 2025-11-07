# 구현 계획: UC-004 정기결제 자동화 (Recurring Billing)

## 프로젝트 ID: PLAN-UC-004

### 제목
TossPayments Billing Key 기반 정기결제 자동화 시스템 구현

---

## 1. 개요

### 1.1 목표
Supabase Cron을 통해 매일 00:00 KST에 자동으로 결제 예정 사용자를 조회하고, TossPayments Billing Key API를 호출하여 자동 청구를 실행하며, 결제 성공/실패에 따라 사용자 플랜 상태를 관리하는 정기결제 자동화 시스템을 구현합니다.

### 1.2 참고 문서
- **유스케이스**: `/docs/usecases/004/spec.md`
- **데이터베이스 스키마**: `/docs/database.md`
- **유저 플로우**: `/docs/userflow.md` (Feature 012)
- **외부 서비스**: `/docs/external/tosspayments-webhook-guide.md`
- **프로젝트 가이드**: `/CLAUDE.md`
- **UC-002 Plan**: `/docs/usecases/002/plan.md` (TossPayments 클라이언트 재사용)

### 1.3 범위

**포함 사항**:
- Cron 엔드포인트 (`/api/cron/billing`)
- Cron Secret 검증 미들웨어
- TossPayments Billing Key API 연동 (UC-002에서 구현된 클라이언트 재사용 + 추가 메서드)
- 배치 처리 로직 (최대 500명 제한)
- 결제 성공 시 `next_billing_date` +1개월 갱신
- 결제 실패 시 `plan='suspended'` 전환
- `payment_logs` 트랜잭션 기록 (성공/실패 모두)
- 에러 처리 및 재시도 로직 (TossPayments API 장애 대응)
- Distributed Lock을 통한 중복 실행 방지
- 처리 결과 통계 집계 및 로깅

**제외 사항**:
- 사용자 알림 발송 (이메일/푸시) - 향후 구현
- 관리자 대시보드 통계 화면 - 향후 구현
- 결제 실패 후 7일 이내 자동 재시도 - 향후 구현
- `suspended` → `free` 전환 Cron - 별도 UC로 구현

---

## 2. 기술 스택

### 2.1 백엔드
- **프레임워크**: Hono (lightweight web framework)
- **데이터베이스**: Supabase (PostgreSQL) + Service Role Key
- **결제**: TossPayments Billing Key API (v1)
- **검증**: Zod (입력 유효성 검증)
- **에러 처리**: 커스텀 Result 타입 (`HandlerResult`)
- **트랜잭션**: Supabase Transactions (BEGIN/COMMIT/ROLLBACK)
- **Lock**: Supabase Advisory Lock (중복 실행 방지)

### 2.2 외부 서비스
- **TossPayments Billing Key API**:
  - `POST /v1/billing/{billingKey}` - 자동 청구
  - Timeout: 10초
  - Retry: 최대 3회 (Exponential Backoff: 2s, 4s, 8s)
- **Supabase Cron**:
  - 스케줄: `0 15 * * *` (15:00 UTC = 00:00 KST 다음날)
  - HTTP POST 요청 with `Authorization: Bearer {CRON_SECRET}`
- **Supabase Advisory Lock**:
  - `pg_try_advisory_lock(hashtext('cron:billing:2025-01-07'))`
  - 중복 실행 방지 보장

### 2.3 환경 변수
```bash
# 기존 환경 변수
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# 신규 추가
CRON_SECRET=your_random_32char_secret  # Cron 인증용
```

---

## 3. 데이터베이스 마이그레이션

### 3.1 새로운 테이블
**없음** - 기존 `users`, `payment_logs` 테이블 사용

### 3.2 기존 테이블 수정
**없음** - 기존 스키마로 충분

### 3.3 인덱스 확인
다음 인덱스가 이미 정의되어 있는지 확인 (UC-002에서 생성):

```sql
-- users 테이블: 결제 예정일 조회 최적화
CREATE INDEX IF NOT EXISTS idx_users_next_billing
  ON users(next_billing_date)
  WHERE plan = 'paid' AND billing_key IS NOT NULL;

-- payment_logs 테이블: 결제 내역 조회
CREATE INDEX IF NOT EXISTS idx_payment_user
  ON payment_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_status
  ON payment_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_order
  ON payment_logs(order_id);
```

### 3.4 Supabase Cron 설정

Supabase SQL Editor에서 실행:

```sql
-- 1. pg_net 확장 활성화 확인
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Cron Secret 저장 (ALTER SYSTEM 권한 필요)
-- 참고: Supabase Console → Settings → Vault에서 설정 권장
-- 또는 Supabase Dashboard → Settings → API → Database Settings

-- 3. Cron Job 등록
SELECT cron.schedule(
  'recurring-billing-automation',  -- Job 이름
  '0 15 * * *',  -- 매일 15:00 UTC (00:00 KST 다음날)
  $$
  SELECT
    net.http_post(
      url := 'https://vcm-saju.vercel.app/api/cron/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- 4. Cron Job 확인
SELECT * FROM cron.job WHERE jobname = 'recurring-billing-automation';

-- 5. Cron 실행 내역 모니터링
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'recurring-billing-automation')
ORDER BY start_time DESC
LIMIT 10;
```

**주의사항**:
- `current_setting('app.settings.cron_secret', true)` 설정은 Supabase Dashboard에서 관리
- Vercel 배포 URL을 실제 도메인으로 변경 필요
- Cron Job이 실행되지 않으면 `cron.job_run_details`에서 에러 확인

---

## 4. 구현 단계 (Implementation Steps)

### Phase 1: TossPayments 클라이언트 확장

**목표**: UC-002에서 구현된 TossPayments 클라이언트에 Billing Key 자동 청구 메서드 추가

**작업 항목**:

#### 4.1.1 TossPayments Billing Key 자동 청구 메서드 추가
- **파일**: `src/lib/external/tosspayments-client.ts` (UC-002에서 생성)
- **설명**: Billing Key로 자동 청구하는 메서드 추가
- **추가 내용**:
  ```typescript
  import { env } from '@/constants/env';

  const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

  // 기존 메서드들...
  // - confirmPayment()
  // - getBillingKey()
  // - deleteBillingKey()
  // - cancelPayment()
  // - getPayment()

  /**
   * Billing Key로 자동 청구 (정기결제)
   * @see https://docs.tosspayments.com/reference#billing-key-%EC%9E%90%EB%8F%99%EA%B2%B0%EC%A0%9C
   */
  export async function chargeBillingKey(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
    customerEmail?: string;
    customerName?: string;
  }): Promise<TossPaymentResponse> {
    return tossRequest<TossPaymentResponse>(
      `/billing/${params.billingKey}`,
      {
        method: 'POST',
        body: JSON.stringify({
          customerKey: params.customerKey,
          amount: params.amount,
          orderId: params.orderId,
          orderName: params.orderName,
          customerEmail: params.customerEmail,
          customerName: params.customerName,
        }),
      },
    );
  }

  /**
   * TossPayments API 응답 타입
   */
  export interface TossPaymentResponse {
    mId: string;
    transactionKey: string;
    paymentKey: string;
    orderId: string;
    orderName: string;
    taxExemptionAmount: number;
    status: 'READY' | 'IN_PROGRESS' | 'WAITING_FOR_DEPOSIT' | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
    requestedAt: string;
    approvedAt: string;
    useEscrow: boolean;
    lastTransactionKey: string | null;
    suppliedAmount: number;
    vat: number;
    cultureExpense: boolean;
    taxFreeAmount: number;
    taxExemptionAmount: number;
    cancels: any[] | null;
    isPartialCancelable: boolean;
    card?: {
      amount: number;
      issuerCode: string;
      acquirerCode: string | null;
      number: string;
      installmentPlanMonths: number;
      approveNo: string;
      useCardPoint: boolean;
      cardType: string;
      ownerType: string;
      acquireStatus: string;
      isInterestFree: boolean;
      interestPayer: string | null;
    };
    virtualAccount: any | null;
    transfer: any | null;
    mobilePhone: any | null;
    giftCertificate: any | null;
    cashReceipt: any | null;
    cashReceipts: any | null;
    discount: any | null;
    cancels: any[];
    secret: string | null;
    type: string;
    easyPay: any | null;
    country: string;
    failure: any | null;
    totalAmount: number;
    balanceAmount: number;
    suppliedAmount: number;
    vat: number;
    cultureExpense: boolean;
    taxFreeAmount: number;
    method: string;
    version: string;
  }

  /**
   * TossPayments API 에러 응답 타입
   */
  export interface TossPaymentsErrorResponse {
    code: string;
    message: string;
  }

  /**
   * TossPayments 에러 클래스 (기존)
   */
  export class TossPaymentsError extends Error {
    constructor(
      public status: number,
      public code: string,
      public apiMessage: string,
    ) {
      super(`TossPayments API Error: ${code} - ${apiMessage}`);
      this.name = 'TossPaymentsError';
    }
  }

  // 공통 fetch 래퍼 (기존)
  async function tossRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${TOSS_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(10000), // 10초 timeout
    });

    const data = await response.json();

    if (!response.ok) {
      const errorData = data as TossPaymentsErrorResponse;
      throw new TossPaymentsError(
        response.status,
        errorData.code || 'UNKNOWN_ERROR',
        errorData.message || 'Unknown error',
      );
    }

    return data as T;
  }

  // Base64 인코딩 헬퍼 (기존)
  const getAuthHeader = () => {
    const encoded = Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString('base64');
    return `Basic ${encoded}`;
  };
  ```
- **의존성**: UC-002에서 구현된 `src/lib/external/tosspayments-client.ts`

#### 4.1.2 Retry 로직 유틸리티 구현
- **파일**: `src/lib/utils/retry.ts`
- **설명**: Exponential Backoff 기반 재시도 로직
- **내용**:
  ```typescript
  /**
   * Exponential Backoff 재시도 로직
   * @param fn - 실행할 비동기 함수
   * @param maxRetries - 최대 재시도 횟수 (기본값: 3)
   * @param baseDelayMs - 초기 지연 시간 (기본값: 2000ms)
   * @returns Promise<T>
   */
  export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 2000,
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // 마지막 시도였으면 에러 throw
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential Backoff 계산: 2s, 4s, 8s
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`,
          { error },
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
  ```
- **의존성**: 없음

**Acceptance Tests**:
- [ ] `chargeBillingKey` API 호출 성공 (테스트 billing_key)
- [ ] TossPayments API timeout (10초) 동작 확인
- [ ] `retryWithBackoff` 3회 재시도 동작 확인
- [ ] Exponential Backoff 지연 시간 검증 (2s, 4s, 8s)

---

### Phase 2: Cron 백엔드 구현

**목표**: `/api/cron/billing` 엔드포인트 구현 및 Cron Secret 검증 로직 추가

**작업 항목**:

#### 4.2.1 Feature 폴더 구조 생성
- **파일**: `src/features/billing-cron/backend/` 디렉토리 생성
- **설명**:
  ```
  src/features/billing-cron/
  └── backend/
      ├── route.ts          # Hono 라우트 핸들러
      ├── service.ts        # 비즈니스 로직
      ├── schema.ts         # Zod 스키마
      └── error.ts          # 에러 코드 정의
  ```
- **의존성**: 없음

#### 4.2.2 에러 코드 정의
- **파일**: `src/features/billing-cron/backend/error.ts`
- **설명**: Cron 관련 에러 코드 상수 정의
- **내용**:
  ```typescript
  export const billingCronErrorCodes = {
    // 인증
    unauthorized: 'CRON_UNAUTHORIZED',
    invalidSecret: 'INVALID_CRON_SECRET',

    // 데이터베이스
    fetchTargetsFailed: 'FETCH_BILLING_TARGETS_FAILED',
    updateUserFailed: 'UPDATE_USER_FAILED',
    insertPaymentLogFailed: 'INSERT_PAYMENT_LOG_FAILED',

    // 결제 처리
    billingChargeFailed: 'BILLING_CHARGE_FAILED',
    tossApiTimeout: 'TOSS_API_TIMEOUT',

    // Lock
    lockAcquisitionFailed: 'LOCK_ACQUISITION_FAILED',
    alreadyRunning: 'CRON_ALREADY_RUNNING',
  } as const;

  export type BillingCronServiceError =
    (typeof billingCronErrorCodes)[keyof typeof billingCronErrorCodes];
  ```
- **의존성**: 없음

#### 4.2.3 스키마 정의
- **파일**: `src/features/billing-cron/backend/schema.ts`
- **설명**: Cron 요청/응답 스키마 정의
- **내용**:
  ```typescript
  import { z } from 'zod';

  /**
   * Cron 응답 스키마
   */
  export const BillingCronResultSchema = z.object({
    success: z.boolean(),
    totalTargets: z.number().int().min(0),
    successCount: z.number().int().min(0),
    failureCount: z.number().int().min(0),
    totalAmount: z.number().int().min(0),
    elapsedTime: z.string(), // "12.5s"
    timestamp: z.string(), // ISO 8601
    message: z.string().optional(),
  });

  export type BillingCronResult = z.infer<typeof BillingCronResultSchema>;

  /**
   * 결제 대상 사용자 Row 스키마
   */
  export const BillingTargetUserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    billing_key: z.string(),
    next_billing_date: z.string(), // YYYY-MM-DD
    plan: z.enum(['paid']),
  });

  export type BillingTargetUser = z.infer<typeof BillingTargetUserSchema>;
  ```
- **의존성**: 4.2.2

#### 4.2.4 Service Layer 구현 (배치 처리)
- **파일**: `src/features/billing-cron/backend/service.ts`
- **설명**: 정기결제 배치 처리 로직
- **내용**:
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { failure, success, type HandlerResult } from '@/backend/http/response';
  import { billingCronErrorCodes, type BillingCronServiceError } from './error';
  import { chargeBillingKey, TossPaymentsError } from '@/lib/external/tosspayments-client';
  import { retryWithBackoff } from '@/lib/utils/retry';
  import type { BillingCronResult, BillingTargetUser } from './schema';
  import { BillingTargetUserSchema } from './schema';

  const SUBSCRIPTION_AMOUNT = 3650; // ₩3,650
  const SUBSCRIPTION_NAME = '365일 사주 월간 구독';
  const BATCH_LIMIT = 500; // 최대 배치 크기

  /**
   * Distributed Lock 획득 (Supabase Advisory Lock)
   * @returns true if lock acquired, false otherwise
   */
  async function acquireLock(
    supabase: SupabaseClient,
    lockKey: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('pg_try_advisory_lock', {
      key: `hashtext('${lockKey}')`,
    });

    if (error) {
      console.error('Lock acquisition error:', error);
      return false;
    }

    return data === true;
  }

  /**
   * Distributed Lock 해제
   */
  async function releaseLock(
    supabase: SupabaseClient,
    lockKey: string,
  ): Promise<void> {
    await supabase.rpc('pg_advisory_unlock', {
      key: `hashtext('${lockKey}')`,
    });
  }

  /**
   * 정기결제 배치 처리 메인 로직
   */
  export const processBillingBatch = async (
    supabase: SupabaseClient,
  ): Promise<
    HandlerResult<BillingCronResult, BillingCronServiceError, unknown>
  > => {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lockKey = `cron:billing:${today}`;

    // 1. Distributed Lock 획득 (중복 실행 방지)
    const lockAcquired = await acquireLock(supabase, lockKey);
    if (!lockAcquired) {
      return failure(
        409,
        billingCronErrorCodes.alreadyRunning,
        `Billing job already running for ${today}`,
      );
    }

    try {
      // 2. 결제 대상 사용자 조회
      const { data: rawUsers, error: fetchError } = await supabase
        .from('users')
        .select('id, email, name, billing_key, next_billing_date, plan')
        .eq('plan', 'paid')
        .eq('next_billing_date', today)
        .not('billing_key', 'is', null)
        .order('next_billing_date', { ascending: true })
        .limit(BATCH_LIMIT);

      if (fetchError) {
        return failure(
          500,
          billingCronErrorCodes.fetchTargetsFailed,
          'Failed to fetch billing targets',
          fetchError,
        );
      }

      // 대상 없음 - 조기 종료
      if (!rawUsers || rawUsers.length === 0) {
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        return success({
          success: true,
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          totalAmount: 0,
          elapsedTime: `${elapsedTime}s`,
          timestamp: new Date().toISOString(),
          message: 'No billing targets for today',
        });
      }

      // 3. 스키마 검증
      const users: BillingTargetUser[] = rawUsers
        .map((u) => BillingTargetUserSchema.safeParse(u))
        .filter((parsed) => parsed.success)
        .map((parsed) => parsed.data as BillingTargetUser);

      console.log(`[Billing Cron] Processing ${users.length} users...`);

      // 4. 각 사용자별 결제 처리
      let successCount = 0;
      let failureCount = 0;
      const failedUsers: Array<{ userId: string; error: string }> = [];

      for (const user of users) {
        const result = await processUserBilling(supabase, user);

        if (result.ok) {
          successCount++;
        } else {
          failureCount++;
          failedUsers.push({
            userId: user.id,
            error: result.error.message,
          });
        }

        // Rate Limiting: 100ms 간격으로 처리 (초당 10건)
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 5. 통계 집계
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalAmount = successCount * SUBSCRIPTION_AMOUNT;

      console.log('[Billing Cron] Batch completed:', {
        totalTargets: users.length,
        successCount,
        failureCount,
        totalAmount,
        elapsedTime: `${elapsedTime}s`,
      });

      if (failedUsers.length > 0) {
        console.error('[Billing Cron] Failed users:', failedUsers);
      }

      return success({
        success: true,
        totalTargets: users.length,
        successCount,
        failureCount,
        totalAmount,
        elapsedTime: `${elapsedTime}s`,
        timestamp: new Date().toISOString(),
      });
    } finally {
      // 6. Lock 해제
      await releaseLock(supabase, lockKey);
    }
  };

  /**
   * 개별 사용자 결제 처리
   */
  async function processUserBilling(
    supabase: SupabaseClient,
    user: BillingTargetUser,
  ): Promise<HandlerResult<void, BillingCronServiceError, unknown>> {
    const orderId = `recurring_${user.id}_${Date.now()}`;

    try {
      // 1. TossPayments Billing Key 자동 청구 (Retry 3회)
      const payment = await retryWithBackoff(
        () =>
          chargeBillingKey({
            billingKey: user.billing_key,
            customerKey: user.id,
            amount: SUBSCRIPTION_AMOUNT,
            orderId,
            orderName: SUBSCRIPTION_NAME,
            customerEmail: user.email,
            customerName: user.name || undefined,
          }),
        3, // maxRetries
        2000, // baseDelayMs
      );

      // 2. 결제 성공 처리
      if (payment.status === 'DONE') {
        await handlePaymentSuccess(supabase, user, orderId, payment);
        return success(undefined);
      } else {
        // 결제 상태가 DONE이 아닌 경우 (드물지만 처리)
        throw new Error(`Unexpected payment status: ${payment.status}`);
      }
    } catch (error) {
      // 3. 결제 실패 처리
      await handlePaymentFailure(supabase, user, orderId, error);

      return failure(
        500,
        billingCronErrorCodes.billingChargeFailed,
        `Billing failed for user ${user.id}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * 결제 성공 처리
   */
  async function handlePaymentSuccess(
    supabase: SupabaseClient,
    user: BillingTargetUser,
    orderId: string,
    payment: any,
  ): Promise<void> {
    // 트랜잭션 시작
    const { error: txError } = await supabase.rpc('begin');
    if (txError) {
      console.error('Transaction begin failed:', txError);
    }

    try {
      // 1. payment_logs 기록
      const { error: logError } = await supabase.from('payment_logs').insert({
        user_id: user.id,
        order_id: orderId,
        amount: SUBSCRIPTION_AMOUNT,
        status: 'success',
        billing_key: user.billing_key,
        payment_key: payment.paymentKey,
        approved_at: payment.approvedAt,
        created_at: new Date().toISOString(),
      });

      if (logError) {
        throw logError;
      }

      // 2. users 테이블: next_billing_date +1개월
      const nextBillingDate = new Date(user.next_billing_date);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          next_billing_date: nextBillingDate.toISOString().split('T')[0],
        })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // 트랜잭션 커밋
      await supabase.rpc('commit');

      console.log(`[Billing Success] User: ${user.id}, Order: ${orderId}`);
    } catch (error) {
      // 트랜잭션 롤백
      await supabase.rpc('rollback');
      throw error;
    }
  }

  /**
   * 결제 실패 처리
   */
  async function handlePaymentFailure(
    supabase: SupabaseClient,
    user: BillingTargetUser,
    orderId: string,
    error: unknown,
  ): Promise<void> {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = 'Unknown error';

    if (error instanceof TossPaymentsError) {
      errorCode = error.code;
      errorMessage = error.apiMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // 트랜잭션 시작
    const { error: txError } = await supabase.rpc('begin');
    if (txError) {
      console.error('Transaction begin failed:', txError);
    }

    try {
      // 1. payment_logs 기록
      const { error: logError } = await supabase.from('payment_logs').insert({
        user_id: user.id,
        order_id: orderId,
        amount: SUBSCRIPTION_AMOUNT,
        status: 'failed',
        billing_key: user.billing_key,
        error_code: errorCode,
        error_message: errorMessage,
        created_at: new Date().toISOString(),
      });

      if (logError) {
        throw logError;
      }

      // 2. users 테이블: plan='suspended'
      // Billing Key 만료인 경우에만 NULL 처리
      const updateData: any = { plan: 'suspended' };
      if (errorCode === 'NOT_FOUND_BILLING_KEY') {
        updateData.billing_key = null;
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // 트랜잭션 커밋
      await supabase.rpc('commit');

      console.error(`[Billing Failed] User: ${user.id}, Error: ${errorCode}`);
    } catch (dbError) {
      // 트랜잭션 롤백
      await supabase.rpc('rollback');
      console.error('Failed to record payment failure:', dbError);
    }
  }
  ```
- **의존성**: 4.2.1, 4.2.2, 4.2.3, 4.1.1, 4.1.2

#### 4.2.5 Route Handler 구현
- **파일**: `src/features/billing-cron/backend/route.ts`
- **설명**: Cron 엔드포인트 라우트 핸들러
- **내용**:
  ```typescript
  import type { Hono } from 'hono';
  import { failure, respond } from '@/backend/http/response';
  import { getSupabase, type AppEnv } from '@/backend/hono/context';
  import { billingCronErrorCodes } from './error';
  import { processBillingBatch } from './service';
  import { env } from '@/constants/env';

  /**
   * Cron Secret 검증 미들웨어
   */
  function verifyCronSecret(req: Request): boolean {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return false;
    }

    const token = authHeader.replace('Bearer ', '');
    return token === env.CRON_SECRET;
  }

  export const registerBillingCronRoutes = (app: Hono<AppEnv>) => {
    /**
     * POST /api/cron/billing
     * 정기결제 자동화 Cron Job 엔드포인트
     */
    app.post('/cron/billing', async (c) => {
      // 1. Cron Secret 검증
      if (!verifyCronSecret(c.req.raw)) {
        console.error('[Cron Auth Failed]', {
          ip: c.req.header('x-forwarded-for') || 'unknown',
          timestamp: new Date().toISOString(),
        });

        return respond(
          c,
          failure(
            401,
            billingCronErrorCodes.unauthorized,
            'Cron authentication failed',
          ),
        );
      }

      // 2. Supabase 클라이언트 가져오기
      const supabase = getSupabase(c);

      // 3. 배치 처리 실행
      const result = await processBillingBatch(supabase);

      // 4. 응답 반환
      return respond(c, result);
    });
  };
  ```
- **의존성**: 4.2.4

#### 4.2.6 Hono App에 Route 등록
- **파일**: `src/backend/hono/app.ts` (수정)
- **설명**: 메인 Hono 앱에 Billing Cron 라우트 등록
- **수정 사항**:
  ```typescript
  import { Hono } from 'hono';
  import { errorBoundary } from '@/backend/middleware/error';
  import { withAppContext } from '@/backend/middleware/context';
  import { withSupabase } from '@/backend/middleware/supabase';
  import { registerExampleRoutes } from '@/features/example/backend/route';
  import { registerBillingCronRoutes } from '@/features/billing-cron/backend/route'; // 추가
  import type { AppEnv } from '@/backend/hono/context';

  let singletonApp: Hono<AppEnv> | null = null;

  export const createHonoApp = () => {
    if (singletonApp) {
      return singletonApp;
    }

    const app = new Hono<AppEnv>();

    app.use('*', errorBoundary());
    app.use('*', withAppContext());
    app.use('*', withSupabase());

    registerExampleRoutes(app);
    registerBillingCronRoutes(app); // 추가

    singletonApp = app;

    return app;
  };
  ```
- **의존성**: 4.2.5

#### 4.2.7 환경 변수 추가
- **파일**: `src/constants/env.ts` (수정)
- **설명**: `CRON_SECRET` 환경 변수 추가
- **수정 사항**:
  ```typescript
  export const env = {
    // 기존 환경 변수...

    // Cron
    CRON_SECRET: process.env.CRON_SECRET!,
  } as const;
  ```
- **파일**: `.env.local` (로컬), Vercel Dashboard (프로덕션)
- **추가 내용**:
  ```bash
  # Cron Secret (32자 랜덤 문자열)
  CRON_SECRET=your_random_32char_secret_here
  ```
- **의존성**: 없음

**Acceptance Tests**:
- [ ] Cron Secret 검증 성공 (올바른 토큰)
- [ ] Cron Secret 검증 실패 (잘못된 토큰) → 401 응답
- [ ] 결제 대상 사용자 조회 성공 (today = next_billing_date)
- [ ] 대상 사용자 0명 → 조기 종료, 200 응답
- [ ] 결제 성공 → `payment_logs` 기록, `next_billing_date` +1개월
- [ ] 결제 실패 → `payment_logs` 기록, `plan='suspended'`
- [ ] Distributed Lock 동작 확인 (중복 실행 시 409 응답)
- [ ] TossPayments API Retry 3회 동작 확인
- [ ] 통계 집계 정확성 검증

---

### Phase 3: 단위 테스트 작성

**목표**: Service Layer 핵심 로직에 대한 단위 테스트 작성

**작업 항목**:

#### 4.3.1 Service 단위 테스트
- **파일**: `src/features/billing-cron/backend/service.test.ts`
- **설명**: `processBillingBatch` 및 헬퍼 함수 테스트
- **테스트 케이스**:

| ID | 테스트 내용 | Mock 데이터 | 기대 결과 |
|----|-----------|-----------|----------|
| UT-001 | 대상 사용자 0명 | `users: []` | `totalTargets: 0`, `successCount: 0` |
| UT-002 | 결제 성공 (1명) | `users: [user1]`, TossPayments 200 OK | `successCount: 1`, `payment_logs` INSERT |
| UT-003 | 결제 실패 (카드 한도) | TossPayments 400 `EXCEED_MAX_CARD_LIMIT` | `failureCount: 1`, `plan='suspended'` |
| UT-004 | Billing Key 미존재 | TossPayments 404 `NOT_FOUND_BILLING_KEY` | `billing_key=null`, `plan='suspended'` |
| UT-005 | TossPayments API Timeout | TossPayments timeout → Retry 3회 | `failureCount: 1`, Retry 로그 3개 |
| UT-006 | Distributed Lock 충돌 | `acquireLock` returns `false` | 409 응답, `CRON_ALREADY_RUNNING` |
| UT-007 | 배치 크기 제한 (500명) | `users: 600명` | 500명만 처리 (LIMIT 검증) |

- **Mock 라이브러리**: Vitest + Supabase Mock
- **의존성**: 4.2.4

#### 4.3.2 Retry 로직 단위 테스트
- **파일**: `src/lib/utils/retry.test.ts`
- **설명**: `retryWithBackoff` 동작 검증
- **테스트 케이스**:

| ID | 테스트 내용 | Mock 동작 | 기대 결과 |
|----|-----------|----------|----------|
| UT-R-001 | 첫 시도 성공 | `fn()` 성공 | 1회만 호출, 결과 반환 |
| UT-R-002 | 2회째 성공 | 1회 실패 → 2회 성공 | 2회 호출, 2초 대기 |
| UT-R-003 | 3회 모두 실패 | 3회 모두 실패 | 3회 호출, 마지막 에러 throw |
| UT-R-004 | Backoff 시간 검증 | 3회 실패 | 대기 시간: 2s, 4s, 8s |

- **의존성**: 4.1.2

**Acceptance Tests**:
- [ ] 모든 단위 테스트 통과 (커버리지 > 80%)
- [ ] Mock Supabase 클라이언트 정상 동작
- [ ] Retry 로직 시간 측정 정확성 검증

---

### Phase 4: 통합 테스트 및 모니터링

**목표**: End-to-End 통합 테스트 및 운영 모니터링 준비

**작업 항목**:

#### 4.4.1 통합 테스트 시나리오
- **파일**: `tests/integration/billing-cron.test.ts`
- **설명**: 실제 Supabase + TossPayments Sandbox 환경 테스트
- **시나리오**:

1. **정상 플로우**:
   - Supabase에 테스트 사용자 생성 (`plan='paid'`, `next_billing_date=today`)
   - Cron 엔드포인트 호출 (올바른 CRON_SECRET)
   - TossPayments Sandbox에서 결제 성공 확인
   - `payment_logs` 기록 확인
   - `next_billing_date` +1개월 검증

2. **결제 실패 플로우**:
   - 잘못된 `billing_key` 사용자 생성
   - Cron 엔드포인트 호출
   - `plan='suspended'` 전환 확인
   - `payment_logs` 실패 기록 확인

3. **중복 실행 방지**:
   - 동시에 2개의 Cron 요청 전송
   - 하나는 성공, 하나는 409 응답 확인

- **의존성**: Phase 1, 2

#### 4.4.2 모니터링 쿼리 작성
- **파일**: `docs/monitoring/billing-cron-queries.sql`
- **설명**: 운영 모니터링용 SQL 쿼리
- **내용**:
  ```sql
  -- 1. 최근 7일 Cron 실행 통계
  SELECT
    DATE(start_time) as date,
    COUNT(*) as total_runs,
    SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as success_runs,
    AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_sec
  FROM cron.job_run_details
  WHERE jobname = 'recurring-billing-automation'
    AND start_time > NOW() - INTERVAL '7 days'
  GROUP BY DATE(start_time)
  ORDER BY date DESC;

  -- 2. 오늘 결제 통계
  SELECT
    status,
    COUNT(*) as count,
    SUM(amount) as total_amount
  FROM payment_logs
  WHERE DATE(created_at) = CURRENT_DATE
    AND order_id LIKE 'recurring_%'
  GROUP BY status;

  -- 3. 결제 실패 사용자 목록 (오늘)
  SELECT
    u.id,
    u.email,
    u.plan,
    pl.error_code,
    pl.error_message,
    pl.created_at
  FROM payment_logs pl
  JOIN users u ON pl.user_id = u.id
  WHERE pl.status = 'failed'
    AND DATE(pl.created_at) = CURRENT_DATE
    AND pl.order_id LIKE 'recurring_%'
  ORDER BY pl.created_at DESC;

  -- 4. 다음 결제 예정 사용자 수 (내일)
  SELECT COUNT(*) as tomorrow_targets
  FROM users
  WHERE plan = 'paid'
    AND next_billing_date = CURRENT_DATE + INTERVAL '1 day'
    AND billing_key IS NOT NULL;

  -- 5. Suspended 사용자 목록 (결제 실패)
  SELECT
    id,
    email,
    plan,
    billing_key,
    next_billing_date,
    updated_at
  FROM users
  WHERE plan = 'suspended'
  ORDER BY updated_at DESC;
  ```
- **의존성**: 없음

#### 4.4.3 알림 설정 (선택)
- **도구**: Supabase Webhooks + Slack/Email
- **설명**: 결제 실패율이 5% 초과 시 관리자 알림
- **트리거 조건**:
  - Cron 실패 (status != 'succeeded')
  - 결제 실패율 > 5%
  - TossPayments API 에러율 > 10%
- **의존성**: Phase 2

**Acceptance Tests**:
- [ ] 통합 테스트 시나리오 모두 통과
- [ ] Supabase Cron 실행 내역 모니터링 가능
- [ ] 결제 통계 쿼리 정확성 검증
- [ ] 알림 트리거 동작 확인 (선택)

---

## 5. API 엔드포인트 구현

### 5.1 엔드포인트: POST /api/cron/billing

**요청**:
```http
POST /api/cron/billing
Host: vcm-saju.vercel.app
Content-Type: application/json
Authorization: Bearer {CRON_SECRET}

{}
```

**응답 (성공 - 200 OK)**:
```json
{
  "success": true,
  "totalTargets": 50,
  "successCount": 48,
  "failureCount": 2,
  "totalAmount": 175200,
  "elapsedTime": "12.5s",
  "timestamp": "2025-01-07T00:00:15.234Z"
}
```

**응답 (대상 없음 - 200 OK)**:
```json
{
  "success": true,
  "totalTargets": 0,
  "successCount": 0,
  "failureCount": 0,
  "totalAmount": 0,
  "elapsedTime": "0.5s",
  "timestamp": "2025-01-07T00:00:01.123Z",
  "message": "No billing targets for today"
}
```

**응답 (Unauthorized - 401)**:
```json
{
  "error": {
    "code": "CRON_UNAUTHORIZED",
    "message": "Cron authentication failed"
  }
}
```

**응답 (중복 실행 - 409)**:
```json
{
  "error": {
    "code": "CRON_ALREADY_RUNNING",
    "message": "Billing job already running for 2025-01-07"
  }
}
```

**구현 파일**:
- Controller: `src/features/billing-cron/backend/route.ts`
- Service: `src/features/billing-cron/backend/service.ts`
- Schema: `src/features/billing-cron/backend/schema.ts`

**단위 테스트**:
- [ ] Cron Secret 검증 성공
- [ ] Cron Secret 검증 실패 → 401
- [ ] 배치 처리 성공 → 200 + 통계
- [ ] 대상 없음 → 200 + message
- [ ] Distributed Lock 충돌 → 409

---

## 6. 보안 고려사항

### 6.1 Cron Secret 관리
- **저장 위치**: Vercel Environment Variables (암호화)
- **생성 방법**: `openssl rand -base64 32` (랜덤 32자)
- **검증 방식**: `Authorization: Bearer {CRON_SECRET}` 헤더 검증
- **주의사항**:
  - `.env.local`은 `.gitignore`에 포함
  - Production/Staging 환경별 다른 Secret 사용
  - Secret 노출 시 즉시 재발급

### 6.2 TossPayments API 인증
- **인증 방식**: Basic Auth (`TOSS_SECRET_KEY`)
- **전송 보안**: HTTPS 강제 (TossPayments API)
- **에러 처리**: API 응답에서 민감 정보 제거 후 로깅

### 6.3 Supabase Service Role Key
- **권한**: RLS 정책 우회 가능 (Service Role 전용)
- **사용 범위**: Cron Job 및 백엔드 API만 사용
- **주의사항**: Client에 절대 노출 금지

### 6.4 Distributed Lock
- **목적**: 동일 날짜 Cron 중복 실행 방지
- **구현**: Supabase Advisory Lock (`pg_try_advisory_lock`)
- **TTL**: Lock 미해제 시에도 다음날 자동 해제 (날짜 기반 Key)

### 6.5 결제 정보 보호
- **PII 보호**: `payment_logs`에 카드 번호 미저장
- **접근 제한**: RLS 정책으로 Service Role만 접근
- **로그 보안**: 에러 로그에서 `billing_key`, `payment_key` 마스킹

---

## 7. 에러 처리

### 7.1 백엔드 에러

| 에러 코드 | HTTP 상태 | 설명 | 처리 방법 |
|----------|----------|------|----------|
| `CRON_UNAUTHORIZED` | 401 | Cron Secret 불일치 | Secret 재확인, 로그 기록 |
| `CRON_ALREADY_RUNNING` | 409 | 중복 실행 감지 | 정상 종료, 다음 실행 대기 |
| `FETCH_BILLING_TARGETS_FAILED` | 500 | DB 조회 실패 | Supabase 연결 확인, 재시도 |
| `BILLING_CHARGE_FAILED` | 500 | TossPayments 결제 실패 | `plan='suspended'`, 사용자 알림 |
| `TOSS_API_TIMEOUT` | 500 | TossPayments API Timeout | Retry 3회, 실패 시 로그 |
| `UPDATE_USER_FAILED` | 500 | User 테이블 갱신 실패 | 트랜잭션 롤백, 재시도 |
| `INSERT_PAYMENT_LOG_FAILED` | 500 | Payment Log 삽입 실패 | 트랜잭션 롤백, 재시도 |

### 7.2 TossPayments API 에러 처리

| TossPayments 에러 코드 | 설명 | 처리 방법 |
|----------------------|------|----------|
| `NOT_FOUND_BILLING_KEY` | Billing Key 미존재 | `billing_key=NULL`, `plan='suspended'` |
| `EXCEED_MAX_CARD_LIMIT` | 카드 한도 초과 | `plan='suspended'`, 사용자 알림 |
| `INVALID_CARD_EXPIRATION` | 카드 유효기간 만료 | `plan='suspended'`, 결제 수단 변경 요청 |
| `PROVIDER_ERROR` | PG사 오류 | Retry 3회, 실패 시 `plan='suspended'` |

### 7.3 에러 로깅 전략
- **성공 로그**: `console.log` (사용자 ID, 주문 ID, 금액)
- **실패 로그**: `console.error` (사용자 ID, 에러 코드, 에러 메시지)
- **보안 로그**: Cron Secret 검증 실패 시 IP 주소 기록
- **모니터링**: Vercel Logs + Supabase `cron.job_run_details`

---

## 8. 테스트 계획

### 8.1 단위 테스트
- **파일**: `src/features/billing-cron/backend/service.test.ts`
- **커버리지 목표**: 80% 이상
- **테스트 케이스**: Phase 3 참조 (UT-001 ~ UT-007)

### 8.2 통합 테스트
- **파일**: `tests/integration/billing-cron.test.ts`
- **시나리오**:
  1. 정상 결제 플로우 (Sandbox 환경)
  2. 결제 실패 플로우 (잘못된 billing_key)
  3. Distributed Lock 중복 실행 방지
  4. TossPayments API Timeout 및 Retry

### 8.3 E2E 테스트
- **환경**: Staging (Vercel Preview Deployment)
- **시나리오**:
  1. Supabase Cron 수동 트리거
  2. Cron 엔드포인트 직접 호출 (올바른 CRON_SECRET)
  3. Cron 엔드포인트 호출 (잘못된 CRON_SECRET) → 401 확인
  4. 결제 성공 사용자 확인 (`payment_logs`, `next_billing_date`)
  5. 결제 실패 사용자 확인 (`plan='suspended'`)

---

## 9. 성능 고려사항

### 9.1 최적화 목표
- **사용자당 평균 처리 시간**: < 5초
- **전체 배치 완료 시간**: < 5분 (50명 기준)
- **TossPayments API 성공률**: > 98%
- **DB 쿼리 응답 시간**: < 100ms (인덱스 활용)

### 9.2 배치 크기 제한
- **LIMIT 500**: 단일 Cron 실행당 최대 500명 처리
- **Rate Limiting**: 100ms 간격 (초당 10건) - TossPayments API 제한 준수
- **Timeout**: Vercel Serverless Function 10분 제한 고려

### 9.3 인덱스 전략
- `idx_users_next_billing`: 결제 예정일 조회 최적화
- `idx_payment_user`: 사용자별 결제 내역 조회
- `idx_payment_status`: 결제 상태별 통계 집계

### 9.4 트랜잭션 최적화
- **범위 최소화**: 단일 사용자 처리 단위로 트랜잭션 분리
- **Deadlock 방지**: 사용자 ID 순서로 처리 (ORDER BY)
- **롤백 전략**: 결제 실패 시에도 `payment_logs` 기록 보장

---

## 10. 배포 계획

### 10.1 환경 변수

**Vercel Dashboard → Settings → Environment Variables**:
```bash
# Production
CRON_SECRET=prod_random_32char_secret_here
TOSS_SECRET_KEY=live_sk_XXXXXXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=prod_service_role_key

# Staging
CRON_SECRET=staging_random_32char_secret_here
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=staging_service_role_key
```

### 10.2 배포 순서

1. **코드 배포**:
   - `src/features/billing-cron/` 구현 완료
   - `src/lib/external/tosspayments-client.ts` 업데이트
   - `src/lib/utils/retry.ts` 추가
   - 단위 테스트 통과 확인

2. **환경 변수 설정**:
   - Vercel Dashboard에서 `CRON_SECRET` 추가
   - Supabase Dashboard에서 `app.settings.cron_secret` 설정

3. **데이터베이스 마이그레이션**:
   - Supabase SQL Editor에서 인덱스 확인
   - Supabase Cron Job 등록 (Section 3.4)

4. **Staging 테스트**:
   - Preview Deployment로 배포
   - Cron 엔드포인트 수동 호출 테스트
   - TossPayments Sandbox 결제 확인

5. **Production 배포**:
   - Main 브랜치 병합
   - Vercel Production 배포
   - Supabase Cron URL을 Production 도메인으로 변경

6. **모니터링 설정**:
   - Vercel Logs 확인
   - Supabase `cron.job_run_details` 모니터링
   - 첫 Cron 실행 (익일 00:00 KST) 확인

### 10.3 롤백 계획

**배포 실패 시**:
1. Vercel Dashboard에서 이전 Deployment로 롤백
2. Supabase Cron Job 일시 중지:
   ```sql
   SELECT cron.unschedule('recurring-billing-automation');
   ```
3. 문제 수정 후 재배포
4. Cron Job 재활성화

**데이터 롤백** (결제 오류 발생 시):
1. 잘못된 `payment_logs` 레코드 삭제
2. `next_billing_date` 원복
3. `plan` 상태 원복
4. TossPayments에서 결제 취소 (필요 시)

---

## 11. 모니터링 및 로깅

### 11.1 로그 항목

**성공 로그**:
```typescript
console.log('[Billing Cron] Processing 50 users...');
console.log('[Billing Success] User: user_123, Order: recurring_user123_1704585600000');
console.log('[Billing Cron] Batch completed:', {
  totalTargets: 50,
  successCount: 48,
  failureCount: 2,
  totalAmount: 175200,
  elapsedTime: '12.5s',
});
```

**실패 로그**:
```typescript
console.error('[Billing Failed] User: user_456, Error: EXCEED_MAX_CARD_LIMIT');
console.error('[Billing Cron] Failed users:', [
  { userId: 'user_456', error: 'Card limit exceeded' },
  { userId: 'user_789', error: 'Billing key not found' },
]);
```

**보안 로그**:
```typescript
console.error('[Cron Auth Failed]', {
  ip: '123.45.67.89',
  timestamp: '2025-01-07T00:00:00.000Z',
});
```

### 11.2 메트릭

- **결제 성공률**: `successCount / totalTargets * 100`
- **평균 처리 시간**: `elapsedTime / totalTargets`
- **일일 결제 금액**: `successCount * 3650`
- **실패 에러 분포**: `GROUP BY error_code`

### 11.3 알림 조건

1. **결제 실패율 > 5%**: Slack/Email 알림
2. **Cron 미실행**: 예정 시각 +1시간 지나도 로그 없음
3. **TossPayments API 에러율 > 10%**: PG사 장애 가능성
4. **처리 시간 > 10분**: Vercel Timeout 위험

---

## 12. 체크리스트

### 12.1 구현 전
- [ ] UC-002 TossPayments 클라이언트 구현 완료 확인
- [ ] Supabase RLS 정책 확인 (`service_role_all_users`, `service_role_all_payment_logs`)
- [ ] 환경 변수 설정 (`CRON_SECRET`, `TOSS_SECRET_KEY`)
- [ ] Supabase Cron 권한 확인 (`pg_net` 확장)

### 12.2 구현 중
- [ ] TossPayments `chargeBillingKey` 메서드 추가
- [ ] Retry 로직 유틸리티 구현
- [ ] Cron Service Layer 배치 처리 로직 구현
- [ ] Distributed Lock 구현 (Advisory Lock)
- [ ] Cron Secret 검증 미들웨어 구현
- [ ] Hono App에 Route 등록
- [ ] 단위 테스트 작성 (커버리지 > 80%)

### 12.3 구현 후
- [ ] 통합 테스트 통과 (Sandbox 환경)
- [ ] Staging 배포 및 수동 테스트
- [ ] Supabase Cron Job 등록
- [ ] Production 배포 및 모니터링
- [ ] 첫 Cron 실행 성공 확인 (익일 00:00 KST)
- [ ] 모니터링 쿼리 작성 및 검증
- [ ] 문서 업데이트 (`CLAUDE.md`, `README.md`)

---

## 13. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2025-01-07 | Claude | 초기 작성 |

---

## 부록

### A. TossPayments Billing Key API 요청 예시

```typescript
// src/features/billing-cron/backend/service.ts 내부

const payment = await chargeBillingKey({
  billingKey: 'BK_20250107_XXXXXXXXXXXX',
  customerKey: 'user_clerk_abc123',
  amount: 3650,
  orderId: 'recurring_user_clerk_abc123_1704585600000',
  orderName: '365일 사주 월간 구독',
  customerEmail: 'user@example.com',
  customerName: '홍길동',
});

// 응답 (성공):
// {
//   "status": "DONE",
//   "paymentKey": "pay_gY3KpY03qnLovE6Wo9NP2",
//   "orderId": "recurring_user_clerk_abc123_1704585600000",
//   "approvedAt": "2025-01-07T00:00:02+09:00",
//   "totalAmount": 3650,
//   ...
// }
```

### B. 의사결정 기록

**결정 1**: Supabase Advisory Lock 사용
- **이유**: Redis/Memcached 없이도 Distributed Lock 구현 가능
- **대안**: Redis (별도 인프라 필요), DB Row Lock (데드락 위험)
- **선택**: Supabase Advisory Lock (`pg_try_advisory_lock`)

**결정 2**: 배치 크기 500명 제한
- **이유**: Vercel Serverless 10분 Timeout, TossPayments API Rate Limit
- **대안**: 무제한 (Timeout 위험), 100명 (효율 낮음)
- **선택**: 500명 (평균 50초 소요 예상)

**결정 3**: Retry 전략 (최대 3회, Exponential Backoff)
- **이유**: TossPayments API 일시적 장애 대응
- **대안**: 즉시 실패 (사용자 불편), 무한 재시도 (리소스 낭비)
- **선택**: 3회 재시도, 2s/4s/8s 간격

### C. 리스크 및 대응 방안

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|-----------|
| TossPayments API 장애 | 중 | 높음 | Retry 3회, 실패 시 `status='pending'` 기록 후 익일 재처리 |
| Supabase Cron 미실행 | 낮음 | 높음 | `cron.job_run_details` 모니터링, Webhook 병행 운영 |
| Vercel Timeout (10분 초과) | 낮음 | 중 | 배치 크기 500명 제한, 평균 처리 시간 모니터링 |
| 중복 청구 | 낮음 | 높음 | Distributed Lock + `order_id` 중복 검사 |
| 결제 성공 후 DB 실패 | 낮음 | 높음 | 트랜잭션 사용, 실패 시 TossPayments 취소 API 호출 |
| CRON_SECRET 노출 | 낮음 | 높음 | `.env.local` .gitignore, Vercel 환경 변수 암호화 |

---

## 참고 문서

- **유스케이스**: `/docs/usecases/004/spec.md`
- **데이터베이스**: `/docs/database.md`
- **TossPayments**: `/docs/external/tosspayments-webhook-guide.md`
- **UC-002 Plan**: `/docs/usecases/002/plan.md`
- **프로젝트 가이드**: `/CLAUDE.md`
- **TossPayments API Docs**: https://docs.tosspayments.com/reference
- **Supabase Cron**: https://supabase.com/docs/guides/database/extensions/pg_cron
