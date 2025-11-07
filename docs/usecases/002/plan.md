# 구현 계획: UC-002 구독 관리 (결제 및 해지)

## 프로젝트 ID: PLAN-UC-002

### 제목
구독 결제, 정기결제, 해지 및 복구 시스템 구현

---

## 1. 개요

### 1.1 목표
무료 사용자가 월 ₩3,650 구독을 시작하고, TossPayments Billing Key를 통한 자동 정기결제를 설정하며, 유료 구독자가 언제든 해지하거나 결제 실패 시 복구할 수 있는 완전한 구독 관리 시스템을 구현합니다.

### 1.2 참고 문서
- **유스케이스**: `/docs/usecases/002/spec.md`
- **데이터베이스 스키마**: `/docs/prompts/database.md`
- **유저 플로우**: `/docs/userflow.md` (Feature 009, 010)
- **외부 서비스**: `/docs/external/tosspayments-webhook-guide.md`
- **프로젝트 가이드**: `/CLAUDE.md`

### 1.3 범위

**포함 사항**:
- 구독 시작 페이지 (`/subscription`)
- TossPayments SDK 결제 위젯 통합
- Billing Key 발급 및 첫 결제 처리
- 구독 해지 플로우 (Billing Key 삭제)
- TossPayments Webhook 처리 (`/api/webhooks/toss`)
- 결제 실패 재시도 로직
- Cron 기반 정기결제 자동화 (`/api/cron/billing`)
- 구독 만료 처리 (cancelled → free 전환)
- 결제 내역 조회 및 관리

**제외 사항**:
- 매일 자동 리포트 생성 (UC-011에서 별도 구현)
- 환불 기능 (MVP 범위 외)
- 연 단위 구독 (MVP는 월 단위만)
- 프로모션 코드/할인 (향후 구현)

---

## 2. 기술 스택

### 2.1 백엔드
- **프레임워크**: Hono (lightweight web framework)
- **데이터베이스**: Supabase (PostgreSQL) + Service Role Key
- **인증**: Clerk SDK (Google OAuth)
- **결제**: TossPayments SDK + API (v1)
- **검증**: Zod (입력 유효성 검증)
- **에러 처리**: 커스텀 Result 타입 (`HandlerResult`)

### 2.2 프론트엔드
- **프레임워크**: Next.js 16 (App Router)
- **UI**: React 19, TailwindCSS 4
- **상태 관리**: React Query (tanstack-query)
- **결제 위젯**: TossPayments Payment Widget SDK
- **폼 관리**: React Hook Form + Zod

### 2.3 외부 서비스
- **TossPayments SDK**:
  - Client Key: 결제 위젯 렌더링
  - Secret Key: 서버 API 인증
  - Webhook Secret: 이벤트 서명 검증
- **TossPayments API**:
  - Billing Auth: 정기결제 등록
  - Payment Confirm: 결제 승인
  - Billing Key 관리: 조회/삭제
  - Payment Cancel: 결제 취소
- **Supabase Cron**: 정기결제 자동화 (매일 00:00 KST)
- **Clerk**: 사용자 인증 및 세션 관리

---

## 3. 데이터베이스 마이그레이션

### 3.1 새로운 테이블
**없음** - 기존 `users`, `payment_logs` 테이블 사용

### 3.2 기존 테이블 수정
**없음** - 기존 스키마로 충분 (`docs/prompts/database.md` 참조)

### 3.3 인덱스 확인
다음 인덱스가 이미 정의되어 있는지 확인:

```sql
-- users 테이블 인덱스 (결제일 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_users_next_billing
  ON users(next_billing_date)
  WHERE plan = 'paid';

-- payment_logs 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_payment_user
  ON payment_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_status
  ON payment_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_order
  ON payment_logs(order_id);
```

### 3.4 마이그레이션 실행 순서
1. Supabase SQL Editor에서 인덱스 존재 여부 확인
2. 누락된 인덱스 생성
3. RLS 정책 확인 (`service_role_all_users`, `service_role_all_payment_logs`)
4. Supabase Cron 설정 확인 (Billing Cron)

---

## 4. 구현 단계 (Implementation Steps)

### Phase 1: TossPayments 클라이언트 모듈 구현

**목표**: TossPayments API 호출을 위한 재사용 가능한 서버 모듈 구현

**작업 항목**:

#### 4.1.1 TossPayments 클라이언트 생성
- **파일**: `src/lib/tosspayments/client.ts`
- **설명**: TossPayments API 호출 공통 모듈
- **내용**:
  ```typescript
  import { env } from '@/constants/env';

  const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

  // Base64 인코딩 헬퍼
  const getAuthHeader = () => {
    const encoded = Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString('base64');
    return `Basic ${encoded}`;
  };

  // 공통 fetch 래퍼
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
    });

    const data = await response.json();

    if (!response.ok) {
      throw new TossPaymentsError(response.status, data);
    }

    return data as T;
  }

  // 결제 승인
  export async function confirmPayment(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
  }) {
    return tossRequest('/payments/confirm', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Billing Key 조회
  export async function getBillingKey(billingKey: string) {
    return tossRequest(`/billing/${billingKey}`, { method: 'GET' });
  }

  // Billing Key 삭제 (해지)
  export async function deleteBillingKey(billingKey: string) {
    return tossRequest(`/billing/${billingKey}`, { method: 'DELETE' });
  }

  // 결제 취소
  export async function cancelPayment(
    paymentKey: string,
    cancelReason: string,
  ) {
    return tossRequest(`/payments/${paymentKey}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancelReason }),
    });
  }

  // 결제 조회
  export async function getPayment(orderId: string) {
    return tossRequest(`/payments/orders/${orderId}`, { method: 'GET' });
  }

  // 커스텀 에러
  export class TossPaymentsError extends Error {
    constructor(
      public status: number,
      public data: any,
    ) {
      super(data.message || 'TossPayments API error');
      this.name = 'TossPaymentsError';
    }
  }
  ```
- **의존성**: 없음

#### 4.1.2 환경 변수 타입 정의
- **파일**: `src/constants/env.ts` (수정)
- **설명**: TossPayments 환경 변수 추가
- **수정 사항**:
  ```typescript
  export const env = {
    // 기존 환경 변수...

    // TossPayments
    TOSS_CLIENT_KEY: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!,
    TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY!,
    TOSS_WEBHOOK_SECRET: process.env.TOSS_WEBHOOK_SECRET!,
  } as const;
  ```
- **의존성**: 없음

**Acceptance Tests**:
- [ ] `confirmPayment` API 호출 성공
- [ ] `deleteBillingKey` API 호출 성공
- [ ] TossPaymentsError 올바르게 던지기
- [ ] Authorization 헤더 올바르게 생성

---

### Phase 2: 구독 시작 백엔드 API 구현

**목표**: 구독 결제 성공 콜백 처리 및 사용자 플랜 업데이트

**작업 항목**:

#### 4.2.1 Feature 폴더 구조 생성
- **파일**: `src/features/subscription/backend/` 디렉토리 생성
- **설명**:
  ```
  src/features/subscription/
  ├── backend/
  │   ├── route.ts          # Hono 라우트 핸들러
  │   ├── service.ts        # 비즈니스 로직
  │   ├── schema.ts         # Zod 스키마
  │   └── error.ts          # 에러 코드 정의
  ├── components/           # React 컴포넌트 (Phase 3)
  └── hooks/                # React Query 훅 (Phase 3)
  ```
- **의존성**: 없음

#### 4.2.2 에러 코드 정의
- **파일**: `src/features/subscription/backend/error.ts`
- **설명**: 구독 관련 에러 코드 상수 정의
- **내용**:
  ```typescript
  export const subscriptionErrorCodes = {
    // 인증/권한
    unauthorized: 'UNAUTHORIZED',

    // 구독 상태 검증
    alreadySubscribed: 'ALREADY_SUBSCRIBED',
    notSubscribed: 'NOT_SUBSCRIBED',
    invalidPlan: 'INVALID_PLAN_STATE',

    // 결제 처리
    paymentConfirmFailed: 'PAYMENT_CONFIRM_FAILED',
    billingKeyMissing: 'BILLING_KEY_MISSING',
    invalidBillingKey: 'INVALID_BILLING_KEY',

    // 데이터베이스
    userUpdateFailed: 'USER_UPDATE_FAILED',
    paymentLogFailed: 'PAYMENT_LOG_FAILED',

    // 해지
    cancelBillingFailed: 'CANCEL_BILLING_FAILED',
    alreadyCancelled: 'ALREADY_CANCELLED',

    // 재시도
    retryPaymentFailed: 'RETRY_PAYMENT_FAILED',

    // 입력 검증
    invalidInput: 'INVALID_SUBSCRIPTION_INPUT',
  } as const;

  export type SubscriptionServiceError =
    (typeof subscriptionErrorCodes)[keyof typeof subscriptionErrorCodes];
  ```
- **의존성**: 없음

#### 4.2.3 입력 스키마 정의
- **파일**: `src/features/subscription/backend/schema.ts`
- **설명**: Zod 스키마로 입력 검증 규칙 정의
- **내용**:
  ```typescript
  import { z } from 'zod';

  // GET /api/subscription/success 쿼리 파라미터
  export const SubscriptionSuccessQuerySchema = z.object({
    customerKey: z.string().min(1),
    billingKey: z.string().min(1),
    authKey: z.string().optional(),
  });

  export type SubscriptionSuccessQuery = z.infer<
    typeof SubscriptionSuccessQuerySchema
  >;

  // POST /api/subscription/cancel 요청 바디
  export const CancelSubscriptionInputSchema = z.object({
    reason: z.string().optional(),
  });

  export type CancelSubscriptionInput = z.infer<
    typeof CancelSubscriptionInputSchema
  >;

  // POST /api/subscription/retry 요청 바디
  export const RetryPaymentInputSchema = z.object({
    // 빈 바디 (현재는 자동으로 billing_key 사용)
  });

  // API 응답 스키마
  export const SubscriptionStatusResponseSchema = z.object({
    plan: z.enum(['free', 'paid', 'cancelled', 'suspended']),
    billingKey: z.string().nullable(),
    nextBillingDate: z.string().nullable(),
  });

  export type SubscriptionStatusResponse = z.infer<
    typeof SubscriptionStatusResponseSchema
  >;
  ```
- **의존성**: 4.2.2

#### 4.2.4 Service Layer 구현 (구독 시작)
- **파일**: `src/features/subscription/backend/service.ts`
- **설명**: 구독 시작 비즈니스 로직
- **내용**:
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { failure, success, type HandlerResult } from '@/backend/http/response';
  import { subscriptionErrorCodes, type SubscriptionServiceError } from './error';
  import { confirmPayment } from '@/lib/tosspayments/client';
  import { nanoid } from 'nanoid';

  const SUBSCRIPTION_AMOUNT = 3650; // ₩3,650
  const SUBSCRIPTION_NAME = '365일 운세 월 구독';

  export const startSubscription = async (
    supabase: SupabaseClient,
    userId: string,
    billingKey: string,
  ): Promise<
    HandlerResult<
      { plan: string; nextBillingDate: string },
      SubscriptionServiceError,
      unknown
    >
  > => {
    try {
      // 1. 현재 플랜 확인
      const { data: userData, error: selectError } = await supabase
        .from('users')
        .select('plan, billing_key')
        .eq('id', userId)
        .single();

      if (selectError) {
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '사용자 정보 조회 실패',
          selectError,
        );
      }

      // 이미 구독 중인지 확인
      if (userData.plan === 'paid') {
        return failure(
          409,
          subscriptionErrorCodes.alreadySubscribed,
          '이미 구독 중입니다',
        );
      }

      // 2. TossPayments 첫 결제 승인
      const orderId = `order_${nanoid()}`;
      const payment = await confirmPayment({
        billingKey,
        customerKey: userId,
        amount: SUBSCRIPTION_AMOUNT,
        orderId,
        orderName: SUBSCRIPTION_NAME,
      });

      if (payment.status !== 'DONE') {
        return failure(
          400,
          subscriptionErrorCodes.paymentConfirmFailed,
          '결제 승인 실패',
          { paymentStatus: payment.status },
        );
      }

      // 3. 다음 결제일 계산 (1개월 후)
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // 4. users 테이블 업데이트 (트랜잭션 시작)
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'paid',
          billing_key: billingKey,
          next_billing_date: nextBillingDate.toISOString().split('T')[0],
          tests_remaining: 365, // 유료 전환 시 리셋
        })
        .eq('id', userId);

      if (updateError) {
        // 실패 시 롤백 필요 (결제 취소)
        // TODO: cancelPayment 호출 (환불)
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '구독 정보 업데이트 실패',
          updateError,
        );
      }

      // 5. payment_logs 기록
      const { error: logError } = await supabase.from('payment_logs').insert({
        user_id: userId,
        order_id: orderId,
        amount: SUBSCRIPTION_AMOUNT,
        status: 'success',
        billing_key: billingKey,
        payment_key: payment.paymentKey,
        approved_at: new Date().toISOString(),
      });

      if (logError) {
        // 로그 실패는 치명적이지 않음 (warn only)
        console.warn('Payment log insertion failed:', logError);
      }

      return success({
        plan: 'paid',
        nextBillingDate: nextBillingDate.toISOString().split('T')[0],
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TossPaymentsError') {
        return failure(
          500,
          subscriptionErrorCodes.paymentConfirmFailed,
          'TossPayments 결제 승인 오류',
          error,
        );
      }

      return failure(
        500,
        subscriptionErrorCodes.paymentConfirmFailed,
        '구독 시작 중 오류 발생',
        error,
      );
    }
  };
  ```
- **의존성**: 4.2.2, 4.2.3, Phase 1

#### 4.2.5 Service Layer 구현 (구독 해지)
- **파일**: `src/features/subscription/backend/service.ts` (계속)
- **설명**: 구독 해지 비즈니스 로직
- **내용**:
  ```typescript
  import { deleteBillingKey } from '@/lib/tosspayments/client';

  export const cancelSubscription = async (
    supabase: SupabaseClient,
    userId: string,
  ): Promise<
    HandlerResult<
      { plan: string; nextBillingDate: string | null },
      SubscriptionServiceError,
      unknown
    >
  > => {
    try {
      // 1. 현재 구독 정보 조회
      const { data: userData, error: selectError } = await supabase
        .from('users')
        .select('plan, billing_key, next_billing_date')
        .eq('id', userId)
        .single();

      if (selectError) {
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '사용자 정보 조회 실패',
          selectError,
        );
      }

      // 구독 중인지 확인
      if (userData.plan !== 'paid') {
        return failure(
          400,
          subscriptionErrorCodes.notSubscribed,
          '구독 중인 플랜이 없습니다',
        );
      }

      if (!userData.billing_key) {
        return failure(
          400,
          subscriptionErrorCodes.billingKeyMissing,
          'Billing Key가 존재하지 않습니다',
        );
      }

      // 2. TossPayments Billing Key 삭제
      let tossDeleteSuccess = false;
      try {
        await deleteBillingKey(userData.billing_key);
        tossDeleteSuccess = true;
      } catch (error) {
        // 재시도 로직 (최대 3회)
        for (let i = 0; i < 3; i++) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
            await deleteBillingKey(userData.billing_key!);
            tossDeleteSuccess = true;
            break;
          } catch {
            // 계속 재시도
          }
        }

        if (!tossDeleteSuccess) {
          // 모든 재시도 실패 - 수동 처리 필요
          console.error('Billing key deletion failed after retries', {
            userId,
            billingKey: userData.billing_key,
          });
          // 그래도 DB는 업데이트 (사용자에게는 해지 완료 안내)
        }
      }

      // 3. users 테이블 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'cancelled',
          billing_key: null,
        })
        .eq('id', userId);

      if (updateError) {
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '구독 해지 정보 업데이트 실패',
          updateError,
        );
      }

      // 4. payment_logs 기록
      await supabase.from('payment_logs').insert({
        user_id: userId,
        order_id: `cancellation_${userId}_${Date.now()}`,
        amount: 0,
        status: 'cancelled',
        approved_at: new Date().toISOString(),
      });

      return success({
        plan: 'cancelled',
        nextBillingDate: userData.next_billing_date,
      });
    } catch (error) {
      return failure(
        500,
        subscriptionErrorCodes.cancelBillingFailed,
        '구독 해지 중 오류 발생',
        error,
      );
    }
  };
  ```
- **의존성**: 4.2.4

#### 4.2.6 Service Layer 구현 (결제 재시도)
- **파일**: `src/features/subscription/backend/service.ts` (계속)
- **설명**: 결제 실패 시 재시도 로직
- **내용**:
  ```typescript
  export const retryPayment = async (
    supabase: SupabaseClient,
    userId: string,
  ): Promise<
    HandlerResult<
      { plan: string; nextBillingDate: string },
      SubscriptionServiceError,
      unknown
    >
  > => {
    try {
      // 1. 현재 사용자 정보 조회
      const { data: userData, error: selectError } = await supabase
        .from('users')
        .select('plan, billing_key')
        .eq('id', userId)
        .single();

      if (selectError) {
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '사용자 정보 조회 실패',
          selectError,
        );
      }

      // suspended 상태인지 확인
      if (userData.plan !== 'suspended') {
        return failure(
          400,
          subscriptionErrorCodes.invalidPlan,
          '재결제 대상이 아닙니다',
        );
      }

      if (!userData.billing_key) {
        return failure(
          400,
          subscriptionErrorCodes.billingKeyMissing,
          'Billing Key가 존재하지 않습니다',
        );
      }

      // 2. 재결제 시도
      const orderId = `retry_${nanoid()}`;
      const payment = await confirmPayment({
        billingKey: userData.billing_key,
        customerKey: userId,
        amount: SUBSCRIPTION_AMOUNT,
        orderId,
        orderName: `${SUBSCRIPTION_NAME} (재시도)`,
      });

      if (payment.status !== 'DONE') {
        // 재결제 실패 로그
        await supabase.from('payment_logs').insert({
          user_id: userId,
          order_id: orderId,
          amount: SUBSCRIPTION_AMOUNT,
          status: 'failed',
          error_code: payment.code || 'RETRY_FAILED',
          error_message: payment.message || '재결제 실패',
        });

        return failure(
          400,
          subscriptionErrorCodes.retryPaymentFailed,
          '재결제에 실패했습니다',
          { paymentStatus: payment.status },
        );
      }

      // 3. 성공 시 플랜 복구
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'paid',
          next_billing_date: nextBillingDate.toISOString().split('T')[0],
        })
        .eq('id', userId);

      if (updateError) {
        return failure(
          500,
          subscriptionErrorCodes.userUpdateFailed,
          '플랜 복구 실패',
          updateError,
        );
      }

      // 4. payment_logs 기록
      await supabase.from('payment_logs').insert({
        user_id: userId,
        order_id: orderId,
        amount: SUBSCRIPTION_AMOUNT,
        status: 'success',
        billing_key: userData.billing_key,
        payment_key: payment.paymentKey,
        approved_at: new Date().toISOString(),
      });

      return success({
        plan: 'paid',
        nextBillingDate: nextBillingDate.toISOString().split('T')[0],
      });
    } catch (error) {
      return failure(
        500,
        subscriptionErrorCodes.retryPaymentFailed,
        '재결제 중 오류 발생',
        error,
      );
    }
  };
  ```
- **의존성**: 4.2.5

#### 4.2.7 Hono Route Handler 구현
- **파일**: `src/features/subscription/backend/route.ts`
- **설명**: 구독 관련 API 엔드포인트
- **내용**:
  ```typescript
  import type { Hono } from 'hono';
  import { failure, respond } from '@/backend/http/response';
  import { getLogger, getSupabase, type AppEnv } from '@/backend/hono/context';
  import { auth } from '@clerk/nextjs';
  import {
    SubscriptionSuccessQuerySchema,
    CancelSubscriptionInputSchema,
  } from './schema';
  import {
    startSubscription,
    cancelSubscription,
    retryPayment,
  } from './service';
  import { subscriptionErrorCodes } from './error';

  export const registerSubscriptionRoutes = (app: Hono<AppEnv>) => {
    // GET /api/subscription/success - 구독 결제 성공 콜백
    app.get('/subscription/success', async (c) => {
      const logger = getLogger(c);
      const supabase = getSupabase(c);

      // 1. Clerk 인증 검증
      const { userId } = auth();
      if (!userId) {
        return c.redirect('/login');
      }

      // 2. 쿼리 파라미터 검증
      const query = c.req.query();
      const parsed = SubscriptionSuccessQuerySchema.safeParse(query);

      if (!parsed.success) {
        logger.error('Invalid subscription success query', { query });
        return c.redirect('/subscription?error=invalid_callback');
      }

      const { customerKey, billingKey } = parsed.data;

      // 3. customerKey가 현재 사용자와 일치하는지 확인
      if (customerKey !== userId) {
        logger.warn('Customer key mismatch', { customerKey, userId });
        return c.redirect('/subscription?error=unauthorized');
      }

      logger.info('Processing subscription success', { userId, billingKey });

      // 4. 구독 시작 처리
      const result = await startSubscription(supabase, userId, billingKey);

      if (!result.ok) {
        logger.error('Subscription start failed', { userId, error: result.error });
        return c.redirect(
          `/subscription?error=${result.error.code.toLowerCase()}`,
        );
      }

      logger.info('Subscription started successfully', {
        userId,
        plan: result.data.plan,
        nextBillingDate: result.data.nextBillingDate,
      });

      // 5. 대시보드로 리다이렉트 (성공 토스트 표시)
      return c.redirect('/dashboard?subscription=success');
    });

    // POST /api/subscription/cancel - 구독 해지
    app.post('/subscription/cancel', async (c) => {
      const logger = getLogger(c);
      const supabase = getSupabase(c);

      // 1. Clerk 인증 검증
      const { userId } = auth();
      if (!userId) {
        return respond(
          c,
          failure(401, subscriptionErrorCodes.unauthorized, '로그인이 필요합니다'),
        );
      }

      // 2. 요청 바디 파싱
      const body = await c.req.json();
      const parsed = CancelSubscriptionInputSchema.safeParse(body);

      if (!parsed.success) {
        return respond(
          c,
          failure(
            400,
            subscriptionErrorCodes.invalidInput,
            '입력이 올바르지 않습니다',
          ),
        );
      }

      logger.info('Processing subscription cancellation', { userId });

      // 3. 구독 해지 처리
      const result = await cancelSubscription(supabase, userId);

      if (!result.ok) {
        logger.error('Subscription cancellation failed', {
          userId,
          error: result.error,
        });
        return respond(c, result);
      }

      logger.info('Subscription cancelled successfully', {
        userId,
        nextBillingDate: result.data.nextBillingDate,
      });

      return respond(c, result);
    });

    // POST /api/subscription/retry - 결제 재시도
    app.post('/subscription/retry', async (c) => {
      const logger = getLogger(c);
      const supabase = getSupabase(c);

      // 1. Clerk 인증 검증
      const { userId } = auth();
      if (!userId) {
        return respond(
          c,
          failure(401, subscriptionErrorCodes.unauthorized, '로그인이 필요합니다'),
        );
      }

      logger.info('Processing payment retry', { userId });

      // 2. 재결제 처리
      const result = await retryPayment(supabase, userId);

      if (!result.ok) {
        logger.error('Payment retry failed', { userId, error: result.error });
        return respond(c, result);
      }

      logger.info('Payment retry successful', { userId });

      return respond(c, result);
    });

    // GET /api/subscription/status - 구독 상태 조회
    app.get('/subscription/status', async (c) => {
      const logger = getLogger(c);
      const supabase = getSupabase(c);

      const { userId } = auth();
      if (!userId) {
        return respond(
          c,
          failure(401, subscriptionErrorCodes.unauthorized, '로그인이 필요합니다'),
        );
      }

      const { data, error } = await supabase
        .from('users')
        .select('plan, billing_key, next_billing_date')
        .eq('id', userId)
        .single();

      if (error) {
        return respond(
          c,
          failure(
            500,
            subscriptionErrorCodes.userUpdateFailed,
            '구독 정보 조회 실패',
            error,
          ),
        );
      }

      return c.json({
        plan: data.plan,
        billingKey: data.billing_key,
        nextBillingDate: data.next_billing_date,
      });
    });
  };
  ```
- **의존성**: 4.2.6

#### 4.2.8 Hono App에 라우트 등록
- **파일**: `src/backend/hono/app.ts`
- **설명**: Subscription 라우트를 메인 Hono 앱에 등록
- **수정 사항**:
  ```typescript
  import { registerSubscriptionRoutes } from '@/features/subscription/backend/route';

  // 기존 코드...

  // Register feature routes
  registerExampleRoutes(app);
  registerAnalysisRoutes(app);
  registerSubscriptionRoutes(app); // 추가

  export { app };
  ```
- **의존성**: 4.2.7

**Acceptance Tests**:
- [ ] `GET /api/subscription/success` 엔드포인트 정상 등록
- [ ] Clerk 미인증 시 `/login`으로 리다이렉트
- [ ] `customerKey` 불일치 시 에러 리다이렉트
- [ ] 이미 구독 중인 사용자는 `ALREADY_SUBSCRIBED` 에러
- [ ] 결제 승인 성공 시 `plan='paid'` 업데이트
- [ ] `POST /api/subscription/cancel` 호출 시 `plan='cancelled'` 전환
- [ ] `POST /api/subscription/retry` 호출 시 재결제 성공

---

### Phase 3: 프론트엔드 구독 페이지 구현

**목표**: `/subscription` 페이지에 TossPayments 결제 위젯 통합 및 구독 관리 UI 구현

**작업 항목**:

#### 4.3.1 구독 페이지 생성
- **파일**: `src/app/(protected)/subscription/page.tsx`
- **설명**: 구독 시작 및 관리 페이지
- **내용**:
  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { useRouter, useSearchParams } from 'next/navigation';
  import { useSubscriptionStatus } from '@/features/subscription/hooks/useSubscriptionStatus';
  import { SubscriptionPlanCard } from '@/features/subscription/components/SubscriptionPlanCard';
  import { TossPaymentWidget } from '@/features/subscription/components/TossPaymentWidget';
  import { CancelSubscriptionModal } from '@/features/subscription/components/CancelSubscriptionModal';

  export default function SubscriptionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: status, isLoading } = useSubscriptionStatus();
    const [showCancelModal, setShowCancelModal] = useState(false);

    // URL 쿼리 파라미터로 성공/실패 토스트 표시
    useEffect(() => {
      const subscription = searchParams.get('subscription');
      const error = searchParams.get('error');

      if (subscription === 'success') {
        alert('🎉 365일 운세 구독이 시작되었습니다!');
        router.replace('/subscription');
      }

      if (error) {
        alert(`구독 처리 중 오류가 발생했습니다: ${error}`);
        router.replace('/subscription');
      }
    }, [searchParams, router]);

    if (isLoading) {
      return <div>로딩 중...</div>;
    }

    return (
      <div className="container max-w-4xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">365일 운세 구독</h1>

        {/* 현재 플랜 상태 */}
        <SubscriptionPlanCard status={status} />

        {/* 무료 → 유료 전환 */}
        {status?.plan === 'free' && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">
              365일 운세 시작하기
            </h2>
            <p className="text-gray-600 mb-6">
              월 ₩3,650으로 매일 AI가 생성한 맞춤 사주를 받아보세요.
            </p>

            <TossPaymentWidget />
          </div>
        )}

        {/* 유료 → 해지 */}
        {status?.plan === 'paid' && (
          <div className="mt-8">
            <button
              onClick={() => setShowCancelModal(true)}
              className="text-red-600 underline"
            >
              구독 해지하기
            </button>
          </div>
        )}

        {/* 해지 예정 */}
        {status?.plan === 'cancelled' && (
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800">
              구독이 해지되었습니다. {status.nextBillingDate}까지 서비스를 이용하실 수 있습니다.
            </p>
          </div>
        )}

        {/* 결제 실패 */}
        {status?.plan === 'suspended' && (
          <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 mb-4">
              ⚠️ 결제 실패 - 카드 정보를 확인해주세요
            </p>
            <button
              onClick={() => router.push('/api/subscription/retry')}
              className="px-4 py-2 bg-red-600 text-white rounded-lg"
            >
              재결제 시도
            </button>
          </div>
        )}

        {/* 해지 확인 모달 */}
        {showCancelModal && (
          <CancelSubscriptionModal
            onClose={() => setShowCancelModal(false)}
            nextBillingDate={status?.nextBillingDate || ''}
          />
        )}
      </div>
    );
  }
  ```
- **의존성**: 없음

#### 4.3.2 TossPayments 위젯 컴포넌트
- **파일**: `src/features/subscription/components/TossPaymentWidget.tsx`
- **설명**: TossPayments SDK 결제 위젯 렌더링
- **내용**:
  ```tsx
  'use client';

  import { useEffect, useRef, useState } from 'react';
  import { loadTossPayments } from '@tosspayments/payment-widget-sdk';
  import { env } from '@/constants/env';
  import { useAuth } from '@clerk/nextjs';

  export const TossPaymentWidget = () => {
    const { userId } = useAuth();
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const widgetRef = useRef<any>(null);

    useEffect(() => {
      if (!userId) return;

      (async () => {
        const tossPayments = await loadTossPayments(env.TOSS_CLIENT_KEY);

        // Billing Auth 위젯 렌더링
        widgetRef.current = tossPayments;
        setIsReady(true);
      })();
    }, [userId]);

    const handleSubscribe = async () => {
      if (!widgetRef.current || !userId) return;

      setIsLoading(true);

      try {
        await widgetRef.current.requestBillingAuth({
          customerKey: userId,
          successUrl: `${window.location.origin}/api/subscription/success`,
          failUrl: `${window.location.origin}/subscription?error=payment_failed`,
        });
      } catch (error) {
        console.error('Payment widget error:', error);
        alert('결제 위젯 로드 중 오류가 발생했습니다.');
        setIsLoading(false);
      }
    };

    return (
      <div className="border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-2">월 ₩3,650</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>✓ 매일 오전 6시 자동 생성되는 AI 운세</li>
            <li>✓ Gemini Pro 모델로 더 정밀한 분석</li>
            <li>✓ 언제든지 해지 가능</li>
          </ul>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={!isReady || isLoading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          {isLoading ? '결제 진행 중...' : '365일 운세 시작하기'}
        </button>

        <p className="text-xs text-gray-500 mt-4 text-center">
          결제 정보는 TossPayments를 통해 안전하게 처리됩니다.
        </p>
      </div>
    );
  };
  ```
- **의존성**: 4.3.1

#### 4.3.3 구독 상태 카드 컴포넌트
- **파일**: `src/features/subscription/components/SubscriptionPlanCard.tsx`
- **설명**: 현재 플랜 상태 표시
- **내용**:
  ```tsx
  import type { SubscriptionStatusResponse } from '../backend/schema';

  interface SubscriptionPlanCardProps {
    status: SubscriptionStatusResponse | undefined;
  }

  export const SubscriptionPlanCard = ({ status }: SubscriptionPlanCardProps) => {
    if (!status) return null;

    const planLabels = {
      free: '무료 체험',
      paid: '365일 운세 구독 중',
      cancelled: '해지 예정',
      suspended: '결제 실패',
    };

    return (
      <div className="border rounded-lg p-6 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              {planLabels[status.plan as keyof typeof planLabels]}
            </h2>
            {status.nextBillingDate && (
              <p className="text-gray-600 mt-1">
                다음 결제일: {status.nextBillingDate}
              </p>
            )}
          </div>

          {status.plan === 'paid' && (
            <div className="text-2xl font-bold text-blue-600">₩3,650/월</div>
          )}
        </div>
      </div>
    );
  };
  ```
- **의존성**: 4.3.1

#### 4.3.4 해지 확인 모달 컴포넌트
- **파일**: `src/features/subscription/components/CancelSubscriptionModal.tsx`
- **설명**: 해지 확인 및 처리
- **내용**:
  ```tsx
  'use client';

  import { useState } from 'react';
  import { useCancelSubscription } from '../hooks/useCancelSubscription';

  interface CancelSubscriptionModalProps {
    onClose: () => void;
    nextBillingDate: string;
  }

  export const CancelSubscriptionModal = ({
    onClose,
    nextBillingDate,
  }: CancelSubscriptionModalProps) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const cancelMutation = useCancelSubscription();

    const handleConfirm = async () => {
      setIsProcessing(true);

      try {
        await cancelMutation.mutateAsync({});
        alert(`🧾 구독이 해지되었습니다. ${nextBillingDate}까지 서비스를 이용하실 수 있습니다.`);
        onClose();
        window.location.reload();
      } catch (error) {
        alert('해지 처리 중 오류가 발생했습니다.');
        setIsProcessing(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h2 className="text-xl font-bold mb-4">정말 해지하시겠습니까?</h2>

          <div className="mb-6 space-y-2 text-sm text-gray-600">
            <p>다음 결제일({nextBillingDate})까지 서비스는 계속 이용하실 수 있습니다.</p>
            <p>해지 후에도 분석 히스토리는 유지됩니다.</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 py-2 border rounded-lg"
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
            >
              {isProcessing ? '처리 중...' : '해지하기'}
            </button>
          </div>
        </div>
      </div>
    );
  };
  ```
- **의존성**: 4.3.3

#### 4.3.5 React Query Hooks 구현
- **파일**: `src/features/subscription/hooks/useSubscriptionStatus.ts`
- **설명**: 구독 상태 조회 훅
- **내용**:
  ```typescript
  import { useQuery } from '@tanstack/react-query';
  import type { SubscriptionStatusResponse } from '../backend/schema';

  export const useSubscriptionStatus = () => {
    return useQuery<SubscriptionStatusResponse>({
      queryKey: ['subscription', 'status'],
      queryFn: async () => {
        const response = await fetch('/api/subscription/status');
        if (!response.ok) {
          throw new Error('Failed to fetch subscription status');
        }
        return response.json();
      },
      staleTime: 1000 * 60 * 5, // 5분 캐싱
    });
  };
  ```
- **의존성**: 4.3.1

#### 4.3.6 구독 해지 훅
- **파일**: `src/features/subscription/hooks/useCancelSubscription.ts`
- **설명**: 구독 해지 API 호출
- **내용**:
  ```typescript
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import type { CancelSubscriptionInput } from '../backend/schema';

  export const useCancelSubscription = () => {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: async (input: CancelSubscriptionInput) => {
        const response = await fetch('/api/subscription/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || '해지 처리 실패');
        }

        return data;
      },
      onSuccess: () => {
        // 구독 상태 쿼리 무효화
        queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
      },
    });
  };
  ```
- **의존성**: 4.3.5

**Acceptance Tests**:
- [ ] `/subscription` 페이지 접속 시 현재 플랜 표시
- [ ] 무료 사용자에게 TossPayments 위젯 렌더링
- [ ] "365일 운세 시작하기" 클릭 시 결제창 표시
- [ ] 결제 성공 시 `/api/subscription/success` 콜백 호출
- [ ] 유료 사용자에게 "구독 해지하기" 버튼 표시
- [ ] 해지 확인 모달 표시 및 처리
- [ ] 결제 실패(suspended) 사용자에게 "재결제 시도" 버튼 표시

---

### Phase 4: TossPayments Webhook 처리

**목표**: TossPayments 이벤트를 안전하게 수신하고 결제 상태 업데이트

**작업 항목**:

#### 4.4.1 Webhook 엔드포인트 생성
- **파일**: `src/app/api/webhooks/toss/route.ts`
- **설명**: TossPayments Webhook 수신
- **내용**:
  ```typescript
  import { NextResponse } from 'next/server';
  import crypto from 'crypto';
  import { createClient } from '@/lib/supabase/server';
  import { env } from '@/constants/env';

  // Webhook 서명 검증
  function verifySignature(rawBody: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha512', env.TOSS_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return signature === expectedSignature;
  }

  export async function POST(req: Request) {
    try {
      const rawBody = await req.text();
      const signature = req.headers.get('TossPayments-Signature');

      // 1. 서명 검증
      if (!signature || !verifySignature(rawBody, signature)) {
        console.error('❌ Invalid TossPayments Webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }

      // 2. 이벤트 파싱
      const event = JSON.parse(rawBody);
      const { eventType, data } = event;

      console.log('📩 TossPayments Webhook received:', eventType);

      const supabase = await createClient();

      // 3. 이벤트 타입별 처리
      if (eventType === 'PAYMENT_STATUS_CHANGED') {
        const { orderId, status, customerKey, billingKey, amount } = data;

        // payment_logs 기록
        await supabase.from('payment_logs').insert({
          order_id: orderId,
          user_id: customerKey,
          status: status === 'DONE' ? 'success' : 'failed',
          amount: amount?.total || 0,
          billing_key: billingKey,
          approved_at: new Date().toISOString(),
          error_code: data.code || null,
          error_message: data.message || null,
        });

        // 결제 완료 시 유저 플랜 업데이트
        if (status === 'DONE') {
          const nextBillingDate = new Date();
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

          await supabase
            .from('users')
            .update({
              plan: 'paid',
              next_billing_date: nextBillingDate.toISOString().split('T')[0],
            })
            .eq('id', customerKey);

          console.log('✅ User plan updated to paid:', customerKey);
        }

        // 결제 실패 시 suspended 전환
        if (status === 'FAILED') {
          await supabase
            .from('users')
            .update({ plan: 'suspended' })
            .eq('id', customerKey);

          console.log('⚠️ User plan suspended:', customerKey);
        }
      }

      if (eventType === 'BILLING_KEY_ISSUED') {
        console.log('🔑 Billing key issued:', data.billingKey);
        // 추가 처리 필요 시 구현
      }

      if (eventType === 'BILLING_KEY_DELETED') {
        console.log('🗑️ Billing key deleted:', data.billingKey);
        // 추가 처리 필요 시 구현
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error('⚠️ Webhook handling failed:', error);
      return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
    }
  }
  ```
- **의존성**: Phase 1, Phase 2

#### 4.4.2 Webhook 서명 검증 테스트
- **파일**: `src/app/api/webhooks/toss/__tests__/route.test.ts`
- **설명**: Webhook 보안 검증 테스트
- **테스트 케이스**:
  ```typescript
  describe('POST /api/webhooks/toss', () => {
    it('should reject invalid signature', async () => {
      const body = JSON.stringify({ eventType: 'TEST' });
      const response = await fetch('/api/webhooks/toss', {
        method: 'POST',
        headers: {
          'TossPayments-Signature': 'invalid_signature',
        },
        body,
      });

      expect(response.status).toBe(401);
    });

    it('should accept valid signature', async () => {
      // Mock valid signature
      // Assert 200 response
    });

    it('should update user plan on PAYMENT_STATUS_CHANGED', async () => {
      // Mock DONE event
      // Assert users.plan='paid'
    });
  });
  ```
- **의존성**: 4.4.1

**Acceptance Tests**:
- [ ] 잘못된 서명 시 401 에러 반환
- [ ] 올바른 서명 시 이벤트 처리
- [ ] `PAYMENT_STATUS_CHANGED` (DONE) 시 `plan='paid'` 업데이트
- [ ] `PAYMENT_STATUS_CHANGED` (FAILED) 시 `plan='suspended'` 업데이트
- [ ] `payment_logs` 테이블에 올바르게 기록

---

### Phase 5: 정기결제 자동화 (Cron)

**목표**: Supabase Cron으로 매일 정기결제 자동 처리

**작업 항목**:

#### 4.5.1 Cron API 엔드포인트 생성
- **파일**: `src/app/api/cron/billing/route.ts`
- **설명**: 정기결제 자동화 Cron Job
- **내용**:
  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { confirmPayment } from '@/lib/tosspayments/client';
  import { env } from '@/constants/env';
  import { nanoid } from 'nanoid';

  const SUBSCRIPTION_AMOUNT = 3650;
  const SUBSCRIPTION_NAME = '365일 운세 월 구독';

  export async function POST(req: Request) {
    try {
      // 1. Cron secret 검증
      const authHeader = req.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      console.log('🕐 Starting billing cron job...');

      const supabase = await createClient();

      // 2. 오늘 결제 대상 조회
      const today = new Date().toISOString().split('T')[0];
      const { data: users, error: selectError } = await supabase
        .from('users')
        .select('id, email, billing_key, next_billing_date')
        .eq('plan', 'paid')
        .eq('next_billing_date', today)
        .not('billing_key', 'is', null);

      if (selectError) {
        console.error('Failed to fetch billing users:', selectError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      if (!users || users.length === 0) {
        console.log('No users to bill today.');
        return NextResponse.json({ message: 'No users to bill' });
      }

      console.log(`Found ${users.length} users to bill.`);

      // 3. 각 사용자에 대해 결제 시도
      const results = await Promise.allSettled(
        users.map(async (user) => {
          const orderId = `recurring_${nanoid()}`;

          try {
            // 결제 청구
            const payment = await confirmPayment({
              billingKey: user.billing_key!,
              customerKey: user.id,
              amount: SUBSCRIPTION_AMOUNT,
              orderId,
              orderName: SUBSCRIPTION_NAME,
            });

            if (payment.status === 'DONE') {
              // 성공: next_billing_date 업데이트
              const nextBillingDate = new Date(user.next_billing_date!);
              nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

              await supabase
                .from('users')
                .update({
                  next_billing_date: nextBillingDate.toISOString().split('T')[0],
                })
                .eq('id', user.id);

              // payment_logs 기록
              await supabase.from('payment_logs').insert({
                user_id: user.id,
                order_id: orderId,
                amount: SUBSCRIPTION_AMOUNT,
                status: 'success',
                billing_key: user.billing_key,
                payment_key: payment.paymentKey,
                approved_at: new Date().toISOString(),
              });

              console.log(`✅ Payment successful for user ${user.id}`);
              return { userId: user.id, status: 'success' };
            } else {
              throw new Error(`Payment status: ${payment.status}`);
            }
          } catch (error: any) {
            // 실패: plan='suspended' 전환
            await supabase
              .from('users')
              .update({ plan: 'suspended' })
              .eq('id', user.id);

            // payment_logs 기록
            await supabase.from('payment_logs').insert({
              user_id: user.id,
              order_id: orderId,
              amount: SUBSCRIPTION_AMOUNT,
              status: 'failed',
              error_code: error.data?.code || 'BILLING_FAILED',
              error_message: error.message || 'Billing error',
            });

            console.error(`❌ Payment failed for user ${user.id}:`, error.message);
            return { userId: user.id, status: 'failed', error: error.message };
          }
        }),
      );

      // 4. 결과 집계
      const summary = {
        total: users.length,
        success: results.filter((r) => r.status === 'fulfilled' && r.value.status === 'success').length,
        failed: results.filter((r) => r.status === 'rejected' || r.value.status === 'failed').length,
      };

      console.log(`🎯 Billing cron completed:`, summary);

      return NextResponse.json({ message: 'Billing cron completed', summary });
    } catch (error) {
      console.error('⚠️ Billing cron error:', error);
      return NextResponse.json({ error: 'Cron error' }, { status: 500 });
    }
  }
  ```
- **의존성**: Phase 1, Phase 2

#### 4.5.2 Supabase Cron 설정
- **파일**: N/A (Supabase Dashboard)
- **설명**: Supabase에서 Cron Job 등록
- **설정 내용**:
  ```sql
  -- Supabase SQL Editor에서 실행
  SELECT cron.schedule(
    'billing-cron',
    '0 0 * * *', -- 매일 00:00 UTC (KST 09:00)
    $$
    SELECT
      net.http_post(
        url := 'https://your-vercel-domain.vercel.app/api/cron/billing',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_CRON_SECRET'
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $$
  );
  ```
- **환경 변수**: `.env.local`에 `CRON_SECRET` 추가
- **의존성**: 4.5.1

#### 4.5.3 만료된 구독 자동 전환 (cancelled → free)
- **파일**: `src/app/api/cron/expiry/route.ts`
- **설명**: 해지 예정 플랜 만료 처리
- **내용**:
  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { env } from '@/constants/env';

  export async function POST(req: Request) {
    try {
      // Cron secret 검증
      const authHeader = req.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      console.log('🕐 Starting expiry cron job...');

      const supabase = await createClient();
      const today = new Date().toISOString().split('T')[0];

      // cancelled 상태에서 next_billing_date가 지난 사용자 조회
      const { data: expiredUsers, error: selectError } = await supabase
        .from('users')
        .select('id')
        .eq('plan', 'cancelled')
        .lte('next_billing_date', today);

      if (selectError) {
        console.error('Failed to fetch expired users:', selectError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      if (!expiredUsers || expiredUsers.length === 0) {
        console.log('No expired subscriptions today.');
        return NextResponse.json({ message: 'No expired subscriptions' });
      }

      console.log(`Found ${expiredUsers.length} expired subscriptions.`);

      // free 플랜으로 전환
      const { error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'free',
          tests_remaining: 0,
          next_billing_date: null,
        })
        .eq('plan', 'cancelled')
        .lte('next_billing_date', today);

      if (updateError) {
        console.error('Failed to update expired users:', updateError);
        return NextResponse.json({ error: 'Update error' }, { status: 500 });
      }

      console.log(`✅ ${expiredUsers.length} users converted to free plan.`);

      return NextResponse.json({
        message: 'Expiry cron completed',
        count: expiredUsers.length,
      });
    } catch (error) {
      console.error('⚠️ Expiry cron error:', error);
      return NextResponse.json({ error: 'Cron error' }, { status: 500 });
    }
  }
  ```
- **Supabase Cron 설정**:
  ```sql
  SELECT cron.schedule(
    'expiry-cron',
    '0 1 * * *', -- 매일 01:00 UTC
    $$
    SELECT
      net.http_post(
        url := 'https://your-vercel-domain.vercel.app/api/cron/expiry',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_CRON_SECRET'
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $$
  );
  ```
- **의존성**: 4.5.1

**Acceptance Tests**:
- [ ] Cron secret 검증 성공/실패
- [ ] `next_billing_date=today` 사용자 정확히 조회
- [ ] 결제 성공 시 `next_billing_date` +1개월 업데이트
- [ ] 결제 실패 시 `plan='suspended'` 전환
- [ ] `payment_logs` 기록 확인
- [ ] 만료된 구독 `free` 전환 확인

---

## 5. API 엔드포인트 구현

### 5.1 엔드포인트: GET /api/subscription/success

**요청**:
```http
GET /api/subscription/success?customerKey={userId}&billingKey={key}&authKey={optional}
Cookie: __session=<clerk_session>
```

**응답 (성공)**:
- 리다이렉트: `/dashboard?subscription=success`

**응답 (실패)**:
- 리다이렉트: `/subscription?error=payment_confirm_failed`

**구현 파일**:
- Route Handler: `src/features/subscription/backend/route.ts`
- Service: `src/features/subscription/backend/service.ts` (`startSubscription`)

**단위 테스트**:
- [ ] `customerKey` 불일치 시 에러 리다이렉트
- [ ] 이미 구독 중인 사용자 `ALREADY_SUBSCRIBED` 에러
- [ ] 결제 승인 성공 시 `plan='paid'` 업데이트
- [ ] `payment_logs` 기록 확인

---

### 5.2 엔드포인트: POST /api/subscription/cancel

**요청**:
```http
POST /api/subscription/cancel
Content-Type: application/json
Cookie: __session=<clerk_session>

{
  "reason": "optional reason"
}
```

**응답 (성공)**:
```json
{
  "plan": "cancelled",
  "nextBillingDate": "2025-02-15"
}
```

**응답 (실패)**:
```json
{
  "error": {
    "code": "NOT_SUBSCRIBED",
    "message": "구독 중인 플랜이 없습니다"
  }
}
```

**구현 파일**:
- Route Handler: `src/features/subscription/backend/route.ts`
- Service: `src/features/subscription/backend/service.ts` (`cancelSubscription`)

**단위 테스트**:
- [ ] `plan != 'paid'` 시 `NOT_SUBSCRIBED` 에러
- [ ] TossPayments Billing Key 삭제 성공
- [ ] 재시도 로직 (최대 3회) 작동
- [ ] `plan='cancelled'` 전환 확인

---

### 5.3 엔드포인트: POST /api/subscription/retry

**요청**:
```http
POST /api/subscription/retry
Content-Type: application/json
Cookie: __session=<clerk_session>

{}
```

**응답 (성공)**:
```json
{
  "plan": "paid",
  "nextBillingDate": "2025-03-01"
}
```

**응답 (실패)**:
```json
{
  "error": {
    "code": "RETRY_PAYMENT_FAILED",
    "message": "재결제에 실패했습니다"
  }
}
```

**구현 파일**:
- Route Handler: `src/features/subscription/backend/route.ts`
- Service: `src/features/subscription/backend/service.ts` (`retryPayment`)

**단위 테스트**:
- [ ] `plan != 'suspended'` 시 `INVALID_PLAN_STATE` 에러
- [ ] 재결제 성공 시 `plan='paid'` 복구
- [ ] 재결제 실패 시 `payment_logs` 기록

---

### 5.4 엔드포인트: GET /api/subscription/status

**요청**:
```http
GET /api/subscription/status
Cookie: __session=<clerk_session>
```

**응답**:
```json
{
  "plan": "paid",
  "billingKey": "bkey_XXXXXXXXXXXX",
  "nextBillingDate": "2025-02-15"
}
```

**구현 파일**:
- Route Handler: `src/features/subscription/backend/route.ts`

**단위 테스트**:
- [ ] 인증되지 않은 사용자 401 에러
- [ ] 올바른 구독 정보 반환

---

### 5.5 엔드포인트: POST /api/webhooks/toss

**요청**:
```http
POST /api/webhooks/toss
TossPayments-Signature: <hmac_signature>
Content-Type: application/json

{
  "eventType": "PAYMENT_STATUS_CHANGED",
  "data": {
    "orderId": "order_XXXX",
    "status": "DONE",
    "customerKey": "user_123",
    "billingKey": "bkey_XXXX",
    "amount": { "total": 3650 }
  }
}
```

**응답**:
```json
{
  "received": true
}
```

**구현 파일**:
- Route: `src/app/api/webhooks/toss/route.ts`

**단위 테스트**:
- [ ] 잘못된 서명 시 401 에러
- [ ] `PAYMENT_STATUS_CHANGED` (DONE) 처리
- [ ] `PAYMENT_STATUS_CHANGED` (FAILED) 처리
- [ ] `payment_logs` 기록 확인

---

### 5.6 엔드포인트: POST /api/cron/billing

**요청**:
```http
POST /api/cron/billing
Authorization: Bearer <CRON_SECRET>
```

**응답**:
```json
{
  "message": "Billing cron completed",
  "summary": {
    "total": 10,
    "success": 8,
    "failed": 2
  }
}
```

**구현 파일**:
- Route: `src/app/api/cron/billing/route.ts`

**단위 테스트**:
- [ ] Cron secret 검증
- [ ] 오늘 결제 대상 정확히 조회
- [ ] 결제 성공 시 `next_billing_date` 업데이트
- [ ] 결제 실패 시 `plan='suspended'` 전환

---

## 6. 프론트엔드 컴포넌트

### 6.1 페이지: /subscription

**경로**: `src/app/(protected)/subscription/page.tsx`

**Props**: 없음 (페이지 컴포넌트)

**기능**:
- 현재 구독 상태 조회 및 표시
- 무료 사용자: TossPayments 위젯 렌더링
- 유료 사용자: 해지 버튼 및 결제일 표시
- 해지 예정: 유효기간 안내
- 결제 실패(suspended): 재결제 버튼

**테스트**:
- [ ] 플랜별 올바른 UI 렌더링
- [ ] TossPayments 위젯 로드 확인
- [ ] 해지 모달 표시 및 처리

---

### 6.2 컴포넌트: TossPaymentWidget

**경로**: `src/features/subscription/components/TossPaymentWidget.tsx`

**Props**: 없음

**기능**:
- TossPayments SDK 로드
- Billing Auth 위젯 렌더링
- 결제 시작 버튼
- Success/Fail URL 콜백 설정

**테스트**:
- [ ] SDK 로드 성공 확인
- [ ] `requestBillingAuth` 호출 확인
- [ ] 로딩 상태 표시

---

### 6.3 컴포넌트: SubscriptionPlanCard

**경로**: `src/features/subscription/components/SubscriptionPlanCard.tsx`

**Props**:
```typescript
interface SubscriptionPlanCardProps {
  status: SubscriptionStatusResponse | undefined;
}
```

**기능**:
- 플랜별 라벨 표시
- 다음 결제일 표시
- 가격 표시 (유료만)

**테스트**:
- [ ] 각 플랜별 올바른 라벨 표시
- [ ] `nextBillingDate` 표시 확인

---

### 6.4 컴포넌트: CancelSubscriptionModal

**경로**: `src/features/subscription/components/CancelSubscriptionModal.tsx`

**Props**:
```typescript
interface CancelSubscriptionModalProps {
  onClose: () => void;
  nextBillingDate: string;
}
```

**기능**:
- 해지 확인 모달
- 유효기간 안내
- 해지 API 호출 및 결과 처리

**테스트**:
- [ ] 모달 렌더링 확인
- [ ] "해지하기" 버튼 클릭 시 API 호출
- [ ] 성공 시 페이지 새로고침

---

## 7. 보안 고려사항

### 7.1 인증/인가
- **Clerk 세션 검증**: 모든 구독 API에서 `auth()` 호출로 `userId` 확인
- **Service Role Key 사용**: Supabase 접근 시 서버 환경에서만 Service Role Key 사용
- **customerKey 검증**: TossPayments 콜백에서 `customerKey === userId` 확인
- **Webhook 서명 검증**: HMAC-SHA512로 TossPayments 이벤트 서명 검증
- **Cron Secret**: Cron 엔드포인트에서 `Authorization` 헤더 검증

### 7.2 데이터 보호
- **환경 변수 관리**: `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`, `CRON_SECRET`는 서버 전용
- **Billing Key 저장**: TossPayments 권장에 따라 평문 저장 (TossPayments 측에서 암호화 관리)
- **Payment Key**: 환불 시 필요하므로 `payment_logs`에 저장
- **SQL Injection 방지**: Supabase SDK 사용으로 자동 방지

### 7.3 CSRF/XSS 방지
- **CSRF**: Clerk 세션 쿠키가 SameSite 설정으로 보호
- **XSS**: React의 자동 이스케이프
- **Webhook Replay Attack**: 타임스탬프 검증 추가 가능 (선택)

---

## 8. 에러 처리

### 8.1 백엔드 에러

| 에러 코드 | HTTP 상태 | 설명 | 처리 방법 |
|----------|----------|------|----------|
| `UNAUTHORIZED` | 401 | Clerk 인증 실패 | 로그인 페이지 리다이렉트 |
| `ALREADY_SUBSCRIBED` | 409 | 이미 구독 중 | 안내 메시지 표시 |
| `NOT_SUBSCRIBED` | 400 | 구독 중이 아님 | 구독 페이지로 유도 |
| `PAYMENT_CONFIRM_FAILED` | 400 | 결제 승인 실패 | 카드 정보 확인 안내 |
| `BILLING_KEY_MISSING` | 400 | Billing Key 없음 | 재구독 유도 |
| `CANCEL_BILLING_FAILED` | 500 | 해지 API 오류 | 재시도 안내 |
| `RETRY_PAYMENT_FAILED` | 400 | 재결제 실패 | 새 결제 수단 등록 유도 |
| `USER_UPDATE_FAILED` | 500 | DB 업데이트 실패 | 관리자 알림 |
| `PAYMENT_LOG_FAILED` | 500 | 로그 기록 실패 | Warn only (비치명적) |

### 8.2 프론트엔드 에러 핸들링

**구독 시작 실패**:
```typescript
if (error.code === 'PAYMENT_CONFIRM_FAILED') {
  alert('결제 승인에 실패했습니다. 카드 정보를 확인해주세요.');
  router.push('/subscription');
}
```

**해지 실패**:
```typescript
if (error.code === 'CANCEL_BILLING_FAILED') {
  alert('해지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
}
```

**재결제 실패**:
```typescript
if (error.code === 'RETRY_PAYMENT_FAILED') {
  showModal({
    title: '재결제 실패',
    message: '카드 한도 또는 정지 여부를 확인해주세요.',
    actions: [
      { label: '새 결제 수단 등록', onClick: () => router.push('/subscription') },
    ],
  });
}
```

---

## 9. 테스트 계획

### 9.1 단위 테스트

**파일**: `src/features/subscription/__tests__/service.test.ts`

**커버리지 목표**: 80% 이상

**테스트 케이스**:

| ID | 테스트 내용 | 입력 | 기대 결과 |
|----|-----------|------|----------|
| UT-001 | `startSubscription` - 성공 | 유효한 billingKey | `success({ plan: 'paid' })` |
| UT-002 | `startSubscription` - 이미 구독 중 | `plan='paid'` 사용자 | `failure(409, 'ALREADY_SUBSCRIBED')` |
| UT-003 | `startSubscription` - 결제 승인 실패 | TossPayments 오류 | `failure(400, 'PAYMENT_CONFIRM_FAILED')` |
| UT-004 | `cancelSubscription` - 성공 | `plan='paid'` 사용자 | `success({ plan: 'cancelled' })` |
| UT-005 | `cancelSubscription` - 구독 중 아님 | `plan='free'` 사용자 | `failure(400, 'NOT_SUBSCRIBED')` |
| UT-006 | `cancelSubscription` - Billing Key 삭제 실패 재시도 | TossPayments 오류 | 3회 재시도 후 DB 업데이트 |
| UT-007 | `retryPayment` - 성공 | `plan='suspended'` 사용자 | `success({ plan: 'paid' })` |
| UT-008 | `retryPayment` - 실패 | TossPayments 오류 | `failure(400, 'RETRY_PAYMENT_FAILED')` |

### 9.2 통합 테스트

**시나리오**: 전체 구독 플로우

1. 무료 사용자 로그인
2. `/subscription` 페이지 접속
3. "365일 운세 시작하기" 클릭
4. TossPayments 위젯에서 카드 정보 입력 (테스트 카드)
5. 결제 승인 완료
6. `/api/subscription/success` 콜백 처리
7. `users.plan='paid'` 확인
8. `payment_logs` 기록 확인
9. "구독 해지하기" 클릭
10. `plan='cancelled'` 확인
11. Cron 실행 후 `plan='free'` 전환 확인

**검증 항목**:
- [ ] TossPayments SDK 정상 로드
- [ ] Billing Key 발급 성공
- [ ] 첫 결제 승인 성공
- [ ] DB 트랜잭션 정상 처리
- [ ] 해지 후 Billing Key 삭제
- [ ] Cron으로 만료 처리

### 9.3 E2E 테스트

**파일**: `tests/e2e/subscription.spec.ts`

**시나리오**: Playwright 기반 사용자 플로우

```typescript
test('구독 시작 및 해지 전체 플로우', async ({ page }) => {
  // 1. 로그인
  await page.goto('/login');
  await page.click('button:has-text("Google로 계속하기")');

  // 2. 구독 페이지 이동
  await page.goto('/subscription');
  await expect(page.locator('h2')).toContainText('무료 체험');

  // 3. 구독 시작
  await page.click('button:has-text("365일 운세 시작하기")');

  // TossPayments 위젯 처리 (iframe)
  // ...

  // 4. 성공 확인
  await page.waitForURL('/dashboard?subscription=success');
  await expect(page.locator('text=구독이 시작되었습니다')).toBeVisible();

  // 5. 구독 페이지 재방문
  await page.goto('/subscription');
  await expect(page.locator('h2')).toContainText('365일 운세 구독 중');

  // 6. 해지
  await page.click('button:has-text("구독 해지하기")');
  await page.click('button:has-text("해지하기")'); // 모달 확인

  // 7. 해지 확인
  await expect(page.locator('text=해지되었습니다')).toBeVisible();
});
```

---

## 10. 성능 고려사항

### 10.1 최적화 목표
- **결제 처리 시간**: < 5초 (P95)
  - Billing Auth 요청: < 2초
  - 결제 승인 API: < 1초
  - DB 업데이트: < 1초
- **Webhook 처리**: < 1초
- **Cron 실행**: < 10초 (사용자 100명 기준)

### 10.2 캐싱 전략
- **구독 상태**: React Query 5분 캐싱 (`staleTime: 1000 * 60 * 5`)
- **TossPayments SDK**: 페이지당 1회만 로드

### 10.3 인덱스 전략
- `users(next_billing_date)`: Cron 쿼리 최적화
- `payment_logs(user_id, created_at DESC)`: 결제 내역 조회
- `payment_logs(order_id)`: 중복 결제 방지

### 10.4 TossPayments API 최적화
- **Retry 로직**: Billing Key 삭제 실패 시 최대 3회 재시도
- **Timeout**: 10초 (TossPayments 권장)
- **Idempotency**: `order_id` 중복 확인

---

## 11. 배포 계획

### 11.1 환경 변수

Vercel Dashboard에 설정:

```bash
# TossPayments (추가)
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_XXXXXXXXXXXX
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXX
TOSS_WEBHOOK_SECRET=whsec_XXXXXXXXXXXX

# Cron Secret (추가)
CRON_SECRET=random_secure_string_XXXXXXXXXXXX

# 기존 환경 변수 (이미 설정됨)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
GEMINI_API_KEY=AIzaSy...
```

### 11.2 배포 순서

1. **개발 환경 테스트**
   - TossPayments 테스트 환경 설정
   - 로컬에서 전체 플로우 테스트
   - Webhook 로컬 테스트 (ngrok 사용)

2. **TossPayments 콘솔 설정**
   - Webhook URL 등록: `https://your-domain.vercel.app/api/webhooks/toss`
   - Webhook Secret 발급 및 환경 변수 저장
   - 테스트 결제 실행

3. **Supabase Cron 설정**
   - Billing Cron 등록 (매일 00:00 UTC)
   - Expiry Cron 등록 (매일 01:00 UTC)
   - Cron 로그 확인

4. **Production 배포**
   - `git push origin main`
   - Vercel 자동 배포
   - Production 환경 변수 확인
   - TossPayments Live Key로 전환 (운영 시)

5. **배포 후 검증**
   - Vercel Functions Logs 확인
   - TossPayments Webhook 로그 확인
   - Supabase Cron 로그 확인
   - 실제 테스트 결제 실행

### 11.3 롤백 계획

**Vercel Rollback**:
1. Vercel Dashboard → Deployments
2. 이전 성공 배포 선택
3. "Promote to Production" 클릭

**데이터베이스 롤백**:
- UC-002는 새 테이블을 생성하지 않으므로 DB 롤백 불필요
- 만약 결제 데이터 삭제 필요 시:
  ```sql
  DELETE FROM payment_logs WHERE created_at > '2025-01-10';
  UPDATE users SET plan='free', billing_key=NULL WHERE plan='paid';
  ```

**TossPayments Webhook 비활성화**:
- TossPayments 콘솔에서 Webhook URL 제거 또는 비활성화

---

## 12. 모니터링 및 로깅

### 12.1 로그 항목

**구독 시작 성공**:
```typescript
logger.info('Subscription started successfully', {
  userId,
  plan: 'paid',
  billingKey,
  nextBillingDate,
  amount: 3650,
});
```

**구독 해지**:
```typescript
logger.info('Subscription cancelled successfully', {
  userId,
  plan: 'cancelled',
  nextBillingDate,
});
```

**결제 실패**:
```typescript
logger.error('Payment failed', {
  userId,
  orderId,
  errorCode,
  errorMessage,
});
```

**Webhook 수신**:
```typescript
logger.info('Webhook received', {
  eventType,
  orderId,
  status,
  customerKey,
});
```

**Cron 실행**:
```typescript
logger.info('Billing cron completed', {
  total,
  success,
  failed,
  duration,
});
```

### 12.2 메트릭

**Vercel Analytics**:
- `/api/subscription/*` 응답 시간
- Webhook 처리 시간
- Cron 실행 시간
- 에러율 (4xx, 5xx)

**Supabase Metrics**:
- `users` 테이블 쿼리 성능
- `payment_logs` INSERT 속도
- Cron Job 실행 이력

**TossPayments Dashboard**:
- 결제 성공률
- Billing Key 발급 성공률
- Webhook 전송 성공률

**Custom Metrics** (Sentry 또는 Datadog):
- 구독 전환율 (free → paid)
- 해지율 (paid → cancelled)
- 재결제 성공률 (suspended → paid)

---

## 13. 문서화

### 13.1 API 문서
- [ ] `/docs/api/subscription.md` 엔드포인트 문서 작성
- [ ] 예제 cURL 요청 추가
- [ ] TossPayments Webhook 이벤트 목록 작성

### 13.2 사용자 가이드
- [ ] `/docs/guides/subscription.md` 구독 관리 가이드
- [ ] 스크린샷 포함 (구독 페이지, 결제 위젯, 해지 모달)

### 13.3 운영 가이드
- [ ] `/docs/operations/billing-cron.md` Cron Job 운영 가이드
- [ ] Webhook 오류 대응 방법
- [ ] 결제 실패 사용자 복구 절차

---

## 14. 체크리스트

### 14.1 구현 전
- [x] 유스케이스 검토 완료 (`/docs/usecases/002/spec.md`)
- [x] 데이터베이스 스키마 확정 (`/docs/prompts/database.md`)
- [x] API 엔드포인트 설계 완료
- [x] 보안 요구사항 확인 (Clerk + Service Role + Webhook 서명)
- [x] TossPayments 가이드 확인 (`/docs/external/tosspayments-webhook-guide.md`)

### 14.2 구현 중
- [ ] Phase 1: TossPayments 클라이언트 모듈 완료
- [ ] Phase 2: 구독 시작 백엔드 API 완료
- [ ] Phase 3: 프론트엔드 구독 페이지 완료
- [ ] Phase 4: TossPayments Webhook 처리 완료
- [ ] Phase 5: 정기결제 Cron 완료
- [ ] 코드 리뷰 완료
- [ ] 단위 테스트 작성 및 통과

### 14.3 구현 후
- [ ] E2E 테스트 통과
- [ ] 성능 테스트 통과 (결제 < 5초)
- [ ] 보안 검토 완료 (Webhook 서명, Cron Secret)
- [ ] TossPayments 테스트 결제 성공
- [ ] API 문서 작성 완료
- [ ] 배포 준비 완료
- [ ] Production 배포 및 검증

---

## 15. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| 1.0 | 2025-01-07 | Claude | 초기 작성 |

---

## 부록

### A. 참고 코드 예시

**TossPayments Billing Key 발급 및 첫 결제 패턴**:

```typescript
// 의사코드: Billing Auth → Billing Key 발급 → 첫 결제 승인
async function startSubscription(userId: string, billingKey: string) {
  try {
    // 1. 플랜 확인
    const user = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single();

    if (user.plan === 'paid') {
      throw new Error('ALREADY_SUBSCRIBED');
    }

    // 2. 첫 결제 승인
    const payment = await confirmPayment({
      billingKey,
      customerKey: userId,
      amount: 3650,
      orderId: generateOrderId(),
      orderName: '365일 운세 월 구독',
    });

    if (payment.status !== 'DONE') {
      throw new Error('PAYMENT_CONFIRM_FAILED');
    }

    // 3. DB 업데이트 (트랜잭션)
    await supabase
      .from('users')
      .update({
        plan: 'paid',
        billing_key: billingKey,
        next_billing_date: addMonths(new Date(), 1),
      })
      .eq('id', userId);

    // 4. payment_logs 기록
    await supabase.from('payment_logs').insert({
      user_id: userId,
      order_id: payment.orderId,
      amount: 3650,
      status: 'success',
      billing_key: billingKey,
      payment_key: payment.paymentKey,
    });

    return { plan: 'paid', nextBillingDate: addMonths(new Date(), 1) };
  } catch (error) {
    // 에러 처리 (롤백 필요 시)
    throw error;
  }
}
```

### B. 의사결정 기록

**결정 1**: TossPayments Billing Key 평문 저장
- **이유**: TossPayments 공식 권장 사항 (TossPayments 측에서 암호화 관리)
- **대안**: 자체 암호화 후 저장
- **선택**: 평문 저장 (TossPayments 권장 준수)

**결정 2**: Webhook 실패 시 Cron Backup 사용
- **이유**: Webhook 누락 가능성 대비 (네트워크 오류, Vercel 다운타임 등)
- **대안**: Webhook만 의존
- **선택**: Webhook 우선, Cron Backup (fail-safe)

**결정 3**: 구독 해지 시 즉시 Billing Key 삭제
- **이유**: 사용자가 해지했으므로 추가 청구 방지
- **대안**: next_billing_date까지 유지
- **선택**: 즉시 삭제 (안전성 우선)

**결정 4**: 재결제 실패 후 7일 유예 기간
- **이유**: 일시적 잔액 부족 등 복구 가능성 고려
- **대안**: 즉시 무료 전환
- **선택**: 7일 suspended 유지 후 free 전환 (사용자 편의)

### C. 리스크 및 대응 방안

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|-----------|
| TossPayments API 장애 | 중 | 높음 | 재시도 로직 + Webhook Backup + Cron Backup |
| Webhook 수신 실패 | 중 | 중 | Cron Job으로 미처리 결제 탐지 (daily check) |
| 결제 성공 후 DB 업데이트 실패 | 낮 | 높음 | 관리자 알림 + 수동 복구 + payment_logs 참조 |
| 중복 결제 | 중 | 높음 | `order_id` UNIQUE 제약 + Idempotency Key |
| Billing Key 삭제 실패 | 낮 | 중 | 재시도 로직 (3회) + 수동 확인 로그 |
| Cron 실행 실패 | 낮 | 중 | Supabase Cron 로그 모니터링 + 관리자 알림 |

---

**구현 우선순위**: P0 (최우선)
**예상 구현 기간**: 7-10일
**담당자**: 백엔드 + 프론트엔드 개발자
**의존 UC**: 없음 (독립적 구현 가능)
**후속 UC**: UC-011 (매일 자동 리포트 생성), UC-012 (정기결제 자동화 - 이미 Phase 5에 포함)
