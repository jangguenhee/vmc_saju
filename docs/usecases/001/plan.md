# 구현 계획: UC-001 AI 사주 분석 요청 (무료 체험)

## 프로젝트 ID: PLAN-UC-001

### 제목
AI 사주 분석 요청 및 무료 체험 관리 시스템 구현

---

## 1. 개요

### 1.1 목표
무료 사용자가 생년월일 정보를 입력하여 AI 기반 사주 분석 결과를 받을 수 있는 기능을 구현합니다. 무료 체험 횟수(3회)를 관리하고, Gemini Flash 모델을 활용하여 사주 분석을 생성하며, 소진 시 구독 전환을 유도합니다.

### 1.2 참고 문서
- **유스케이스**: `/docs/usecases/001/spec.md`
- **데이터베이스 스키마**: `/docs/prompts/database.md`
- **유저 플로우**: `/docs/userflow.md` (Feature 005)
- **외부 서비스**: `/docs/external/gemini-integration-guide.md`
- **프로젝트 가이드**: `/CLAUDE.md`

### 1.3 범위

**포함 사항**:
- 사주 분석 입력 폼 페이지 (`/new`)
- AI 분석 생성 API 엔드포인트 (`POST /api/analysis/generate`)
- 무료 체험 잔여 횟수 확인 및 차감 로직
- Gemini Flash 모델 연동 (재시도 로직 포함)
- 분석 결과 저장 및 조회
- 에러 처리 (체험 소진, API 오류, 타임아웃)
- 로딩 UI 및 사용자 피드백

**제외 사항**:
- 유료 사용자 분석 (UC-002에서 별도 구현)
- 결제 및 구독 시스템 (UC-009에서 구현)
- 분석 결과 상세 페이지 (UC-007에서 구현)
- 공유 기능 (UC-008에서 구현)

---

## 2. 기술 스택

### 2.1 백엔드
- **프레임워크**: Hono (lightweight web framework)
- **데이터베이스**: Supabase (PostgreSQL) + Service Role Key
- **인증**: Clerk SDK (Google OAuth)
- **AI**: Google Gemini API (`gemini-2.5-flash`)
- **검증**: Zod (입력 유효성 검증)
- **에러 처리**: 커스텀 Result 타입 (`HandlerResult`)

### 2.2 프론트엔드
- **프레임워크**: Next.js 16 (App Router)
- **UI**: React 19, TailwindCSS 4
- **상태 관리**: React Query (tanstack-query)
- **폼 관리**: React Hook Form + Zod
- **로딩 상태**: 진행률 바 + 순차 메시지

### 2.3 외부 서비스
- **Gemini API**: AI 사주 분석 생성
  - 모델: `gemini-2.5-flash`
  - 타임아웃: 10초
  - 재시도: 최대 3회 (exponential backoff)
- **Clerk**: 사용자 인증 및 세션 관리
- **Supabase**: 데이터베이스 및 RLS

---

## 3. 데이터베이스 마이그레이션

### 3.1 새로운 테이블
이미 `/docs/prompts/database.md`에 정의된 스키마 사용:
- `users` 테이블 (이미 존재)
- `analysis` 테이블 (이미 존재)

### 3.2 기존 테이블 수정
**없음** - 기존 스키마로 충분

### 3.3 인덱스 확인
다음 인덱스가 이미 정의되어 있는지 확인:

```sql
-- analysis 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_analysis_user
  ON analysis(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_type
  ON analysis(user_id, type, created_at DESC);

-- users 테이블 인덱스 (무료 체험 조회용)
CREATE INDEX IF NOT EXISTS idx_users_plan
  ON users(plan);
```

### 3.4 마이그레이션 실행 순서
1. Supabase SQL Editor에서 인덱스 존재 여부 확인
2. 누락된 인덱스 생성
3. RLS 정책 확인 (`service_role_all_analysis`, `service_role_all_users`)

---

## 4. 구현 단계 (Implementation Steps)

### Phase 1: 백엔드 API 구조 설정

**목표**: Hono 기반 분석 API 엔드포인트 구조 구축 및 비즈니스 로직 구현

**작업 항목**:

#### 4.1.1 Feature 폴더 구조 생성
- **파일**: `src/features/analysis/backend/` 디렉토리 생성
- **설명**:
  ```
  src/features/analysis/
  ├── backend/
  │   ├── route.ts          # Hono 라우트 핸들러
  │   ├── service.ts        # 비즈니스 로직
  │   ├── schema.ts         # Zod 스키마
  │   └── error.ts          # 에러 코드 정의
  ├── components/           # React 컴포넌트 (Phase 2)
  └── hooks/                # React Query 훅 (Phase 2)
  ```
- **의존성**: 없음

#### 4.1.2 에러 코드 정의
- **파일**: `src/features/analysis/backend/error.ts`
- **설명**: 분석 관련 에러 코드 상수 정의
- **내용**:
  ```typescript
  export const analysisErrorCodes = {
    // 입력 검증
    invalidInput: 'INVALID_ANALYSIS_INPUT',

    // 무료 체험 관련
    freeTrialExhausted: 'FREE_TRIAL_EXHAUSTED',
    freeTrialCheckError: 'FREE_TRIAL_CHECK_ERROR',

    // AI 분석
    aiAnalysisFailed: 'AI_ANALYSIS_FAILED',
    aiAnalysisTimeout: 'AI_ANALYSIS_TIMEOUT',
    aiAnalysisEmpty: 'AI_ANALYSIS_EMPTY',

    // 데이터베이스
    saveAnalysisFailed: 'SAVE_ANALYSIS_FAILED',
    updateTrialsFailed: 'UPDATE_TRIALS_FAILED',

    // 권한
    unauthorized: 'UNAUTHORIZED',
    notFreeUser: 'NOT_FREE_USER',
  } as const;

  export type AnalysisServiceError =
    (typeof analysisErrorCodes)[keyof typeof analysisErrorCodes];
  ```
- **의존성**: 없음

#### 4.1.3 입력 스키마 정의
- **파일**: `src/features/analysis/backend/schema.ts`
- **설명**: Zod 스키마로 입력 검증 규칙 정의
- **내용**:
  ```typescript
  import { z } from 'zod';

  // POST /api/analysis/generate 요청 바디 스키마
  export const GenerateAnalysisInputSchema = z.object({
    name: z.string().min(1, '이름을 입력해주세요'),
    birthDate: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)')
      .refine((date) => {
        const parsed = new Date(date);
        const now = new Date();
        const minDate = new Date('1900-01-01');
        return parsed >= minDate && parsed <= now;
      }, '유효한 생년월일을 입력해주세요'),
    birthTime: z.string().optional(),
    gender: z.enum(['male', 'female'], {
      errorMap: () => ({ message: '성별을 선택해주세요' }),
    }),
  });

  export type GenerateAnalysisInput = z.infer<typeof GenerateAnalysisInputSchema>;

  // Analysis 테이블 행 스키마
  export const AnalysisRowSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string(),
    input: z.record(z.any()),
    output_markdown: z.string(),
    model: z.string(),
    type: z.enum(['free', 'daily', 'manual']),
    created_at: z.string(),
  });

  export type AnalysisRow = z.infer<typeof AnalysisRowSchema>;

  // API 응답 스키마
  export const GenerateAnalysisResponseSchema = z.object({
    analysisId: z.string().uuid(),
    testsRemaining: z.number().int().min(0),
  });

  export type GenerateAnalysisResponse = z.infer<typeof GenerateAnalysisResponseSchema>;
  ```
- **의존성**: 4.1.2

#### 4.1.4 Service Layer 구현 (무료 체험 확인)
- **파일**: `src/features/analysis/backend/service.ts`
- **설명**: 무료 체험 잔여 확인 로직
- **내용**:
  ```typescript
  import type { SupabaseClient } from '@supabase/supabase-js';
  import { failure, success, type HandlerResult } from '@/backend/http/response';
  import { analysisErrorCodes, type AnalysisServiceError } from './error';

  interface FreeTrialStatus {
    testsRemaining: number;
    plan: string;
  }

  export const checkFreeTrialStatus = async (
    supabase: SupabaseClient,
    userId: string,
  ): Promise<HandlerResult<FreeTrialStatus, AnalysisServiceError, unknown>> => {
    const { data, error } = await supabase
      .from('users')
      .select('tests_remaining, plan')
      .eq('id', userId)
      .single();

    if (error) {
      return failure(
        500,
        analysisErrorCodes.freeTrialCheckError,
        'Failed to check free trial status',
        error
      );
    }

    // Plan 검증
    if (data.plan !== 'free') {
      return failure(
        400,
        analysisErrorCodes.notFreeUser,
        '무료 사용자만 이 기능을 사용할 수 있습니다',
      );
    }

    // 잔여 횟수 검증
    if (data.tests_remaining <= 0) {
      return failure(
        400,
        analysisErrorCodes.freeTrialExhausted,
        '무료 체험이 모두 소진되었습니다',
        { testsRemaining: 0 }
      );
    }

    return success({
      testsRemaining: data.tests_remaining,
      plan: data.plan,
    });
  };
  ```
- **의존성**: 4.1.2, 4.1.3

#### 4.1.5 Service Layer 구현 (AI 분석 생성)
- **파일**: `src/features/analysis/backend/service.ts` (계속)
- **설명**: Gemini API 호출 및 분석 생성
- **내용**:
  ```typescript
  import { generateFreeSajuAnalysis } from '@/lib/gemini';
  import type { GenerateAnalysisInput } from './schema';

  export const createFreeAnalysis = async (
    supabase: SupabaseClient,
    userId: string,
    input: GenerateAnalysisInput,
  ): Promise<HandlerResult<{ analysisId: string; testsRemaining: number }, AnalysisServiceError, unknown>> => {
    try {
      // 1. Gemini API 호출 (retry 로직 포함)
      const aiOutput = await generateFreeSajuAnalysis({
        name: input.name,
        birthDate: input.birthDate,
        birthTime: input.birthTime,
        gender: input.gender,
      });

      if (!aiOutput || aiOutput.trim().length === 0) {
        return failure(
          500,
          analysisErrorCodes.aiAnalysisEmpty,
          'AI 분석 결과가 비어있습니다',
        );
      }

      // 2. 트랜잭션 시작 (분석 저장 + 체험 차감)
      const { data: analysisData, error: insertError } = await supabase
        .from('analysis')
        .insert({
          user_id: userId,
          input: input as any, // JSONB
          output_markdown: aiOutput,
          model: 'gemini-2.5-flash',
          type: 'free',
        })
        .select('id')
        .single();

      if (insertError || !analysisData) {
        return failure(
          500,
          analysisErrorCodes.saveAnalysisFailed,
          '분석 결과 저장에 실패했습니다',
          insertError
        );
      }

      // 3. tests_remaining 차감
      const { data: userData, error: updateError } = await supabase
        .from('users')
        .update({ tests_remaining: supabase.rpc('tests_remaining') - 1 })
        .eq('id', userId)
        .select('tests_remaining')
        .single();

      if (updateError || !userData) {
        // 롤백 필요 (분석은 저장되었으나 차감 실패)
        // Supabase는 자동 롤백 미지원, 수동 삭제
        await supabase.from('analysis').delete().eq('id', analysisData.id);

        return failure(
          500,
          analysisErrorCodes.updateTrialsFailed,
          '무료 체험 차감에 실패했습니다',
          updateError
        );
      }

      return success({
        analysisId: analysisData.id,
        testsRemaining: userData.tests_remaining,
      });

    } catch (error) {
      // Gemini API 에러
      if (error instanceof Error && error.message.includes('timeout')) {
        return failure(
          504,
          analysisErrorCodes.aiAnalysisTimeout,
          'AI 분석 요청 시간이 초과되었습니다',
          error
        );
      }

      return failure(
        500,
        analysisErrorCodes.aiAnalysisFailed,
        'AI 분석 중 오류가 발생했습니다',
        error
      );
    }
  };
  ```
- **의존성**: 4.1.4, Gemini 라이브러리

#### 4.1.6 Hono Route Handler 구현
- **파일**: `src/features/analysis/backend/route.ts`
- **설명**: API 엔드포인트 라우트 핸들러
- **내용**:
  ```typescript
  import type { Hono } from 'hono';
  import { failure, respond } from '@/backend/http/response';
  import { getLogger, getSupabase, type AppEnv } from '@/backend/hono/context';
  import { auth } from '@clerk/nextjs';
  import { GenerateAnalysisInputSchema } from './schema';
  import { checkFreeTrialStatus, createFreeAnalysis } from './service';
  import { analysisErrorCodes } from './error';

  export const registerAnalysisRoutes = (app: Hono<AppEnv>) => {
    // POST /api/analysis/generate - 무료 사주 분석 생성
    app.post('/analysis/generate', async (c) => {
      const logger = getLogger(c);
      const supabase = getSupabase(c);

      // 1. Clerk 인증 검증
      const { userId } = auth();
      if (!userId) {
        return respond(
          c,
          failure(401, analysisErrorCodes.unauthorized, '로그인이 필요합니다')
        );
      }

      // 2. 요청 바디 파싱 및 검증
      const body = await c.req.json();
      const parsed = GenerateAnalysisInputSchema.safeParse(body);

      if (!parsed.success) {
        return respond(
          c,
          failure(
            400,
            analysisErrorCodes.invalidInput,
            '입력 정보가 올바르지 않습니다',
            parsed.error.format()
          )
        );
      }

      logger.info('Starting free analysis generation', { userId });

      // 3. 무료 체험 상태 확인
      const trialStatusResult = await checkFreeTrialStatus(supabase, userId);

      if (!trialStatusResult.ok) {
        logger.warn('Free trial check failed', { userId, error: trialStatusResult.error });
        return respond(c, trialStatusResult);
      }

      // 4. AI 분석 생성 및 저장
      const analysisResult = await createFreeAnalysis(
        supabase,
        userId,
        parsed.data
      );

      if (!analysisResult.ok) {
        logger.error('Analysis creation failed', { userId, error: analysisResult.error });
        return respond(c, analysisResult);
      }

      logger.info('Analysis created successfully', {
        userId,
        analysisId: analysisResult.data.analysisId,
        remaining: analysisResult.data.testsRemaining,
      });

      return respond(c, analysisResult);
    });
  };
  ```
- **의존성**: 4.1.5

#### 4.1.7 Hono App에 라우트 등록
- **파일**: `src/backend/hono/app.ts`
- **설명**: Analysis 라우트를 메인 Hono 앱에 등록
- **수정 사항**:
  ```typescript
  import { registerAnalysisRoutes } from '@/features/analysis/backend/route';

  // 기존 코드...

  // Register feature routes
  registerExampleRoutes(app);
  registerAnalysisRoutes(app); // 추가

  export { app };
  ```
- **의존성**: 4.1.6

**Acceptance Tests**:
- [ ] `POST /api/analysis/generate` 엔드포인트 정상 등록 확인
- [ ] Clerk 미인증 시 401 에러 반환
- [ ] 입력 검증 실패 시 400 에러 + Zod 에러 반환
- [ ] `tests_remaining=0` 시 `FREE_TRIAL_EXHAUSTED` 에러 반환
- [ ] 유료 사용자(`plan='paid'`) 접근 시 `NOT_FREE_USER` 에러 반환

---

### Phase 2: 프론트엔드 입력 폼 구현

**목표**: `/new` 페이지에 사주 분석 입력 폼 UI 및 클라이언트 검증 구현

**작업 항목**:

#### 4.2.1 입력 폼 페이지 생성
- **파일**: `src/app/(protected)/new/page.tsx`
- **설명**: 사주 분석 입력 페이지 컴포넌트
- **내용**:
  ```tsx
  'use client';

  import { useState } from 'react';
  import { useRouter } from 'next/navigation';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { GenerateAnalysisInputSchema, type GenerateAnalysisInput } from '@/features/analysis/backend/schema';
  import { AnalysisForm } from '@/features/analysis/components/AnalysisForm';
  import { LoadingOverlay } from '@/features/analysis/components/LoadingOverlay';
  import { useGenerateAnalysis } from '@/features/analysis/hooks/useGenerateAnalysis';

  export default function NewAnalysisPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const generateMutation = useGenerateAnalysis();

    const form = useForm<GenerateAnalysisInput>({
      resolver: zodResolver(GenerateAnalysisInputSchema),
      defaultValues: {
        name: '',
        birthDate: '',
        birthTime: '',
        gender: undefined,
      },
    });

    const onSubmit = async (data: GenerateAnalysisInput) => {
      setIsLoading(true);

      try {
        const result = await generateMutation.mutateAsync(data);

        // 성공 시 분석 결과 페이지로 이동
        router.push(`/analysis/${result.analysisId}`);
      } catch (error) {
        // 에러 처리는 useGenerateAnalysis 훅에서 수행
        setIsLoading(false);
      }
    };

    return (
      <div className="container max-w-2xl mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">AI 사주 분석</h1>

        {isLoading && <LoadingOverlay />}

        <AnalysisForm form={form} onSubmit={onSubmit} isLoading={isLoading} />
      </div>
    );
  }
  ```
- **의존성**: 없음

#### 4.2.2 입력 폼 컴포넌트
- **파일**: `src/features/analysis/components/AnalysisForm.tsx`
- **설명**: React Hook Form 기반 입력 폼
- **내용**:
  ```tsx
  'use client';

  import { type UseFormReturn } from 'react-hook-form';
  import type { GenerateAnalysisInput } from '../backend/schema';

  interface AnalysisFormProps {
    form: UseFormReturn<GenerateAnalysisInput>;
    onSubmit: (data: GenerateAnalysisInput) => void;
    isLoading: boolean;
  }

  export const AnalysisForm = ({ form, onSubmit, isLoading }: AnalysisFormProps) => {
    const { register, handleSubmit, formState: { errors } } = form;

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 이름 */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            이름 *
          </label>
          <input
            id="name"
            type="text"
            {...register('name')}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        {/* 생년월일 */}
        <div>
          <label htmlFor="birthDate" className="block text-sm font-medium mb-2">
            생년월일 *
          </label>
          <input
            id="birthDate"
            type="date"
            {...register('birthDate')}
            min="1900-01-01"
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          {errors.birthDate && (
            <p className="text-red-500 text-sm mt-1">{errors.birthDate.message}</p>
          )}
        </div>

        {/* 출생시간 (선택) */}
        <div>
          <label htmlFor="birthTime" className="block text-sm font-medium mb-2">
            출생시간 (선택)
          </label>
          <input
            id="birthTime"
            type="time"
            {...register('birthTime')}
            className="w-full px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          <p className="text-gray-500 text-xs mt-1">
            출생시간을 모르시면 비워두세요
          </p>
        </div>

        {/* 성별 */}
        <div>
          <label className="block text-sm font-medium mb-2">성별 *</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="male"
                {...register('gender')}
                disabled={isLoading}
                className="mr-2"
              />
              남성
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="female"
                {...register('gender')}
                disabled={isLoading}
                className="mr-2"
              />
              여성
            </label>
          </div>
          {errors.gender && (
            <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>
          )}
        </div>

        {/* 제출 버튼 */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50"
        >
          {isLoading ? '분석 중...' : 'AI 사주 분석 시작하기'}
        </button>
      </form>
    );
  };
  ```
- **의존성**: 4.2.1

#### 4.2.3 로딩 오버레이 컴포넌트
- **파일**: `src/features/analysis/components/LoadingOverlay.tsx`
- **설명**: 진행률 바 및 순차 메시지 표시
- **내용**:
  ```tsx
  'use client';

  import { useEffect, useState } from 'react';

  const LOADING_MESSAGES = [
    '천간과 지지를 해석하는 중입니다...',
    '오행의 균형을 분석하고 있습니다...',
    '오늘의 운세를 정리하는 중입니다...',
  ];

  export const LoadingOverlay = () => {
    const [messageIndex, setMessageIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
      // 메시지 순환 (3초마다)
      const messageInterval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 3000);

      // 진행률 애니메이션
      const progressInterval = setInterval(() => {
        setProgress((prev) => (prev >= 100 ? 100 : prev + 2));
      }, 200);

      return () => {
        clearInterval(messageInterval);
        clearInterval(progressInterval);
      };
    }, []);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="mb-6">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="text-center text-lg font-medium">
            {LOADING_MESSAGES[messageIndex]}
          </p>
        </div>
      </div>
    );
  };
  ```
- **의존성**: 4.2.1

#### 4.2.4 React Query Hook 구현
- **파일**: `src/features/analysis/hooks/useGenerateAnalysis.ts`
- **설명**: API 호출 및 에러 처리 훅
- **내용**:
  ```typescript
  import { useMutation } from '@tanstack/react-query';
  import type { GenerateAnalysisInput, GenerateAnalysisResponse } from '../backend/schema';

  interface ErrorResponse {
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  }

  export const useGenerateAnalysis = () => {
    return useMutation<GenerateAnalysisResponse, Error, GenerateAnalysisInput>({
      mutationFn: async (input) => {
        const response = await fetch('/api/analysis/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });

        const data = await response.json();

        if (!response.ok) {
          const errorData = data as ErrorResponse;

          // 무료 체험 소진
          if (errorData.error.code === 'FREE_TRIAL_EXHAUSTED') {
            // 구독 페이지로 리다이렉트 (모달 대신 직접 이동)
            window.location.href = '/subscription?reason=trial_exhausted';
            throw new Error(errorData.error.message);
          }

          // 기타 에러
          throw new Error(errorData.error.message || '분석 생성 중 오류가 발생했습니다');
        }

        return data as GenerateAnalysisResponse;
      },
      onError: (error) => {
        // Toast 알림 (선택적)
        console.error('Analysis generation failed:', error);
        alert(error.message);
      },
    });
  };
  ```
- **의존성**: 4.2.1

**Acceptance Tests**:
- [ ] `/new` 페이지 접속 시 입력 폼 정상 렌더링
- [ ] 필수 필드 미입력 시 클라이언트 검증 에러 표시
- [ ] 생년월일 범위 검증 (1900-01-01 ~ 오늘)
- [ ] 성별 선택 필수
- [ ] 제출 시 로딩 UI 표시 (진행률 바 + 메시지)
- [ ] 성공 시 `/analysis/[id]` 페이지로 리다이렉트
- [ ] 무료 체험 소진 시 `/subscription` 페이지로 리다이렉트

---

### Phase 3: 에러 처리 및 재시도 로직

**목표**: Gemini API 오류 발생 시 재시도 로직 및 사용자 피드백 구현

**작업 항목**:

#### 4.3.1 Gemini 재시도 로직 검증
- **파일**: `src/lib/gemini.ts` (이미 구현됨)
- **설명**: 기존 `withRetry` 함수가 올바르게 동작하는지 확인
- **검증 사항**:
  - 최대 3회 재시도
  - Exponential backoff (1s, 2s, 4s)
  - 타임아웃 에러 감지
  - 빈 응답 처리
- **의존성**: 없음

#### 4.3.2 Service Layer 에러 복구 로직
- **파일**: `src/features/analysis/backend/service.ts` (이미 구현됨)
- **설명**: 분석 저장 실패 시 롤백 로직 확인
- **시나리오**:
  1. Gemini API 성공 → `analysis` INSERT 성공 → `tests_remaining` UPDATE 실패
  2. 이 경우 `analysis` 레코드 삭제 (수동 롤백)
  3. 사용자에게 `UPDATE_TRIALS_FAILED` 에러 반환
- **의존성**: Phase 1

#### 4.3.3 프론트엔드 에러 UI
- **파일**: `src/features/analysis/components/ErrorModal.tsx`
- **설명**: 에러 발생 시 모달 표시
- **내용**:
  ```tsx
  interface ErrorModalProps {
    error: string;
    onRetry: () => void;
    onClose: () => void;
  }

  export const ErrorModal = ({ error, onRetry, onClose }: ErrorModalProps) => {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <h2 className="text-xl font-bold mb-4">분석 오류</h2>
          <p className="mb-6">{error}</p>
          <p className="text-sm text-gray-600 mb-6">
            무료 체험 횟수는 복구되었습니다.
          </p>
          <div className="flex gap-4">
            <button
              onClick={onRetry}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg"
            >
              다시 시도하기
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 border rounded-lg"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  };
  ```
- **의존성**: Phase 2

#### 4.3.4 입력값 LocalStorage 복구
- **파일**: `src/features/analysis/hooks/useFormPersistence.ts`
- **설명**: 네트워크 타임아웃 시 입력값 자동 저장 및 복구
- **내용**:
  ```typescript
  import { useEffect } from 'react';
  import type { UseFormReturn } from 'react-hook-form';
  import type { GenerateAnalysisInput } from '../backend/schema';

  const STORAGE_KEY = 'analysis_form_draft';

  export const useFormPersistence = (form: UseFormReturn<GenerateAnalysisInput>) => {
    // 폼 값 변경 시 자동 저장
    useEffect(() => {
      const subscription = form.watch((value) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      });

      return () => subscription.unsubscribe();
    }, [form]);

    // 페이지 로드 시 복구
    useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          form.reset(parsed);

          // 복구 확인 토스트
          if (confirm('이전 입력을 복원하시겠습니까?')) {
            // 사용자 확인 시 유지
          } else {
            // 거부 시 초기화
            form.reset();
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }, [form]);

    // 제출 성공 시 저장된 값 삭제
    const clearDraft = () => {
      localStorage.removeItem(STORAGE_KEY);
    };

    return { clearDraft };
  };
  ```
- **의존성**: Phase 2

**Acceptance Tests**:
- [ ] Gemini API 타임아웃 시 최대 3회 재시도
- [ ] 재시도 실패 시 `AI_ANALYSIS_FAILED` 에러 반환
- [ ] 분석 저장 실패 시 `tests_remaining` 차감 안 됨
- [ ] 에러 발생 시 사용자에게 "무료 체험 복구됨" 안내
- [ ] 네트워크 끊김 시 입력값 localStorage 저장
- [ ] 재접속 시 입력값 복구 확인 모달 표시

---

### Phase 4: 통합 테스트 및 최적화

**목표**: End-to-End 테스트 및 성능 최적화

**작업 항목**:

#### 4.4.1 API 엔드포인트 통합 테스트
- **파일**: `src/features/analysis/__tests__/generate.test.ts`
- **설명**: Vitest 기반 API 테스트
- **테스트 케이스**:
  ```typescript
  describe('POST /api/analysis/generate', () => {
    it('should generate analysis for free user', async () => {
      // Mock Clerk auth
      // Mock Supabase
      // Mock Gemini API
      // Assert success response
    });

    it('should reject when tests_remaining=0', async () => {
      // Assert FREE_TRIAL_EXHAUSTED error
    });

    it('should rollback on save failure', async () => {
      // Mock analysis INSERT success
      // Mock users UPDATE failure
      // Assert analysis deleted
      // Assert UPDATE_TRIALS_FAILED error
    });
  });
  ```
- **의존성**: Phase 1, Phase 2, Phase 3

#### 4.4.2 DB 인덱스 성능 확인
- **파일**: N/A (Supabase SQL Editor)
- **설명**: `EXPLAIN ANALYZE` 쿼리 실행
- **검증 쿼리**:
  ```sql
  EXPLAIN ANALYZE
  SELECT tests_remaining, plan
  FROM users
  WHERE id = 'user_test_id';

  EXPLAIN ANALYZE
  SELECT * FROM analysis
  WHERE user_id = 'user_test_id'
  ORDER BY created_at DESC
  LIMIT 10;
  ```
- **목표**: Index Scan 사용 확인 (Seq Scan 방지)
- **의존성**: Phase 1

#### 4.4.3 응답 시간 목표 검증
- **파일**: N/A (수동 테스트)
- **설명**: 총 처리 시간 < 15초 확인
- **측정 항목**:
  - 입력 검증: < 0.5초
  - DB 조회 (`tests_remaining`): < 0.5초
  - Gemini API: < 10초
  - DB 저장 + UPDATE: < 1초
  - 응답 반환: < 0.5초
- **의존성**: Phase 1, Phase 2

#### 4.4.4 중복 제출 방지
- **파일**: `src/features/analysis/hooks/useGenerateAnalysis.ts` (수정)
- **설명**: React Query의 `mutationKey` 활용하여 중복 요청 방지
- **수정 사항**:
  ```typescript
  export const useGenerateAnalysis = () => {
    return useMutation<GenerateAnalysisResponse, Error, GenerateAnalysisInput>({
      mutationKey: ['generateAnalysis'], // 추가
      mutationFn: async (input) => { /* ... */ },
      // 이미 진행 중이면 새 요청 무시
      retry: false,
    });
  };
  ```
- **의존성**: Phase 2

**Acceptance Tests**:
- [ ] 전체 플로우 E2E 테스트 통과 (로그인 → 입력 → 분석 → 결과)
- [ ] 무료 체험 3회 연속 사용 시 4번째 요청 차단
- [ ] Gemini API 응답 시간 평균 < 8초
- [ ] DB 쿼리 평균 응답 < 50ms
- [ ] 중복 제출 시 첫 번째 요청만 처리

---

## 5. API 엔드포인트 구현

### 5.1 엔드포인트: POST /api/analysis/generate

**요청**:
```http
POST /api/analysis/generate
Content-Type: application/json
Cookie: __session=<clerk_session>

{
  "name": "홍길동",
  "birthDate": "1990-01-01",
  "birthTime": "14:00",
  "gender": "male"
}
```

**응답 (성공)**:
```json
{
  "analysisId": "550e8400-e29b-41d4-a716-446655440000",
  "testsRemaining": 2
}
```

**응답 (무료 체험 소진)**:
```json
{
  "error": {
    "code": "FREE_TRIAL_EXHAUSTED",
    "message": "무료 체험이 모두 소진되었습니다",
    "details": {
      "testsRemaining": 0
    }
  }
}
```

**응답 (AI 분석 실패)**:
```json
{
  "error": {
    "code": "AI_ANALYSIS_FAILED",
    "message": "AI 분석 중 오류가 발생했습니다",
    "details": {
      "originalError": "Gemini API timeout"
    }
  }
}
```

**구현 파일**:
- Route Handler: `src/features/analysis/backend/route.ts`
- Service: `src/features/analysis/backend/service.ts`
- Schema: `src/features/analysis/backend/schema.ts`
- Error Codes: `src/features/analysis/backend/error.ts`

**단위 테스트**:
- [ ] 정상 입력 시 분석 생성 및 `tests_remaining` 차감
- [ ] `tests_remaining=0` 시 `FREE_TRIAL_EXHAUSTED` 반환
- [ ] 유료 사용자(`plan='paid'`) 접근 시 `NOT_FREE_USER` 반환
- [ ] Clerk 미인증 시 401 반환
- [ ] 입력 검증 실패 시 400 + Zod 에러 반환
- [ ] Gemini API 타임아웃 시 `AI_ANALYSIS_TIMEOUT` 반환
- [ ] 분석 저장 실패 시 롤백 확인

---

## 6. 프론트엔드 컴포넌트

### 6.1 페이지: /new

**경로**: `src/app/(protected)/new/page.tsx`

**Props**: 없음 (페이지 컴포넌트)

**기능**:
- 사주 분석 입력 폼 표시
- 클라이언트 검증 (React Hook Form + Zod)
- 로딩 상태 표시 (진행률 바 + 메시지)
- API 호출 및 에러 처리
- 성공 시 `/analysis/[id]` 리다이렉트
- 무료 체험 소진 시 `/subscription` 리다이렉트

**테스트**:
- [ ] 페이지 렌더링 시 폼 표시
- [ ] 필수 필드 미입력 시 에러 표시
- [ ] 제출 시 로딩 UI 표시
- [ ] 성공 시 리다이렉트

### 6.2 컴포넌트: AnalysisForm

**경로**: `src/features/analysis/components/AnalysisForm.tsx`

**Props**:
```typescript
interface AnalysisFormProps {
  form: UseFormReturn<GenerateAnalysisInput>;
  onSubmit: (data: GenerateAnalysisInput) => void;
  isLoading: boolean;
}
```

**기능**:
- 이름, 생년월일, 출생시간, 성별 입력 필드
- 실시간 유효성 검증
- 에러 메시지 표시
- 로딩 중 필드 비활성화

**테스트**:
- [ ] 각 필드 렌더링 확인
- [ ] 검증 실패 시 에러 메시지 표시
- [ ] 로딩 중 입력 비활성화

### 6.3 컴포넌트: LoadingOverlay

**경로**: `src/features/analysis/components/LoadingOverlay.tsx`

**Props**: 없음

**기능**:
- 진행률 바 애니메이션 (0% → 100%)
- 순차 메시지 표시 (3초마다 변경)
- 전체 화면 오버레이

**테스트**:
- [ ] 진행률 바 애니메이션 작동
- [ ] 메시지 순환 확인

---

## 7. 보안 고려사항

### 7.1 인증/인가
- **Clerk 세션 검증**: 모든 API 요청에서 `auth()` 호출로 `userId` 확인
- **Service Role Key 사용**: Supabase 접근 시 서버 환경에서만 Service Role Key 사용
- **클라이언트 격리**: 클라이언트는 Supabase에 직접 접근 불가 (API Routes 경유)
- **사용자 데이터 격리**: API에서 `userId`로 필터링하여 본인 데이터만 접근 가능

### 7.2 데이터 보호
- **환경 변수 관리**: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용
- **입력 검증**: 클라이언트 + 서버 이중 검증 (Zod)
- **SQL Injection 방지**: Supabase SDK 사용으로 자동 방지
- **XSS 방지**: React의 자동 이스케이프 + Markdown 렌더링 시 sanitize (UC-007에서 구현)

### 7.3 Rate Limiting
- **Vercel Edge Functions**: 기본 rate limit 적용
- **추가 보호**: 필요 시 Redis 기반 rate limiting 추가 (향후 구현)

---

## 8. 에러 처리

### 8.1 백엔드 에러

| 에러 코드 | HTTP 상태 | 설명 | 처리 방법 |
|----------|----------|------|----------|
| `UNAUTHORIZED` | 401 | Clerk 인증 실패 | 로그인 페이지 리다이렉트 |
| `INVALID_ANALYSIS_INPUT` | 400 | 입력 검증 실패 | Zod 에러 반환, 클라이언트 필드 에러 표시 |
| `FREE_TRIAL_EXHAUSTED` | 400 | 무료 체험 소진 | `/subscription` 페이지로 리다이렉트 |
| `NOT_FREE_USER` | 400 | 유료 사용자 접근 | 안내 메시지 표시 |
| `FREE_TRIAL_CHECK_ERROR` | 500 | DB 조회 실패 | 재시도 안내 |
| `AI_ANALYSIS_FAILED` | 500 | Gemini API 오류 | 재시도 버튼 제공, 체험권 복구 안내 |
| `AI_ANALYSIS_TIMEOUT` | 504 | Gemini API 타임아웃 | 재시도 안내 |
| `AI_ANALYSIS_EMPTY` | 500 | AI 응답 비어있음 | 재시도 안내 |
| `SAVE_ANALYSIS_FAILED` | 500 | 분석 결과 저장 실패 | 재시도 안내 |
| `UPDATE_TRIALS_FAILED` | 500 | 체험 차감 실패 | 재시도 안내, 분석 삭제 (롤백) |

### 8.2 프론트엔드 에러 핸들링

**무료 체험 소진**:
```typescript
if (error.code === 'FREE_TRIAL_EXHAUSTED') {
  window.location.href = '/subscription?reason=trial_exhausted';
}
```

**AI 분석 오류**:
```typescript
if (error.code === 'AI_ANALYSIS_FAILED') {
  showErrorModal({
    title: 'AI 분석 오류',
    message: error.message,
    note: '무료 체험 횟수는 복구되었습니다.',
    actions: [
      { label: '다시 시도하기', onClick: retry },
      { label: '닫기', onClick: close },
    ],
  });
}
```

**네트워크 오류**:
- 입력값 localStorage 자동 저장
- 재접속 시 복구 확인 모달 표시

---

## 9. 테스트 계획

### 9.1 단위 테스트

**파일**: `src/features/analysis/__tests__/service.test.ts`

**커버리지 목표**: 80% 이상

**테스트 케이스**:

| ID | 테스트 내용 | 입력 | 기대 결과 |
|----|-----------|------|----------|
| UT-001 | `checkFreeTrialStatus` - 정상 케이스 | `userId`, `tests_remaining=2` | `success({ testsRemaining: 2, plan: 'free' })` |
| UT-002 | `checkFreeTrialStatus` - 소진 | `userId`, `tests_remaining=0` | `failure(400, 'FREE_TRIAL_EXHAUSTED')` |
| UT-003 | `checkFreeTrialStatus` - 유료 사용자 | `userId`, `plan='paid'` | `failure(400, 'NOT_FREE_USER')` |
| UT-004 | `createFreeAnalysis` - 성공 | 유효한 입력 | `success({ analysisId, testsRemaining })` |
| UT-005 | `createFreeAnalysis` - Gemini 실패 | 유효한 입력 + API 오류 | `failure(500, 'AI_ANALYSIS_FAILED')` |
| UT-006 | `createFreeAnalysis` - 저장 실패 롤백 | 유효한 입력 + DB 오류 | `failure(500, 'SAVE_ANALYSIS_FAILED')`, 분석 삭제됨 |

### 9.2 통합 테스트

**시나리오**: 전체 무료 체험 플로우

1. 사용자 로그인 (Clerk)
2. `/new` 페이지 접속
3. 정보 입력 후 제출
4. API 호출 → Gemini 분석 생성 → DB 저장 → 체험 차감
5. `/analysis/[id]` 리다이렉트
6. 3회 반복 후 4번째 요청 시 `/subscription` 리다이렉트

**검증 항목**:
- [ ] Clerk 세션 유지
- [ ] `tests_remaining` 정확히 차감 (3 → 2 → 1 → 0)
- [ ] 4번째 요청 시 `FREE_TRIAL_EXHAUSTED` 반환
- [ ] 분석 결과 DB 저장 확인

### 9.3 E2E 테스트

**파일**: `tests/e2e/free-trial.spec.ts`

**시나리오**: Playwright 기반 사용자 플로우

```typescript
test('무료 체험 3회 사용 후 구독 유도', async ({ page }) => {
  // 1. 로그인
  await page.goto('/login');
  await page.click('button:has-text("Google로 계속하기")');

  // 2. 첫 번째 분석
  await page.goto('/new');
  await page.fill('#name', '홍길동');
  await page.fill('#birthDate', '1990-01-01');
  await page.check('input[value="male"]');
  await page.click('button:has-text("AI 사주 분석 시작하기")');
  await page.waitForURL('/analysis/*');

  // 3. 두 번째, 세 번째 분석 반복
  // ...

  // 4. 네 번째 시도
  await page.goto('/new');
  await page.fill('#name', '김철수');
  await page.fill('#birthDate', '1985-05-15');
  await page.check('input[value="male"]');
  await page.click('button:has-text("AI 사주 분석 시작하기")');

  // 5. 구독 페이지로 리다이렉트 확인
  await page.waitForURL('/subscription?reason=trial_exhausted');
  await expect(page.locator('h1')).toContainText('365일 운세 시작하기');
});
```

---

## 10. 성능 고려사항

### 10.1 최적화 목표
- **총 응답 시간**: < 15초 (P95)
- **Gemini API**: < 10초 (평균 5-8초)
- **DB 쿼리**: < 100ms
- **동시 사용자**: 100명 처리 가능

### 10.2 캐싱 전략
- **없음** (실시간 AI 분석이므로 캐싱 불가)
- 분석 결과는 DB에 영구 저장

### 10.3 인덱스 전략
- `users(id)`: PRIMARY KEY (자동)
- `users(plan)`: 플랜별 조회 최적화
- `analysis(user_id, created_at DESC)`: 사용자별 히스토리 조회
- `analysis(user_id, type, created_at DESC)`: 타입별 필터링

### 10.4 Gemini API 최적화
- **Retry 로직**: 최대 3회, exponential backoff
- **Timeout**: 10초 (Gemini Flash는 평균 5초 응답)
- **모델 선택**: Flash (Pro보다 2배 빠름)

---

## 11. 배포 계획

### 11.1 환경 변수

Vercel Dashboard에 설정:

```bash
# 기존 환경 변수 (이미 설정됨)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (Service Role)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
GEMINI_API_KEY=AIzaSy...

# 추가 설정 없음 (UC-001은 기존 환경 변수로 충분)
```

### 11.2 배포 순서

1. **개발 환경 테스트**
   - `npm run dev` 실행
   - 로컬에서 전체 플로우 테스트
   - Supabase 연결 확인
   - Gemini API 호출 확인

2. **Staging 배포** (선택)
   - Vercel Preview 환경 활용
   - E2E 테스트 실행

3. **Production 배포**
   - `git push origin main`
   - Vercel 자동 배포
   - Production 환경 변수 확인

4. **배포 후 검증**
   - Vercel Functions Logs 확인
   - Sentry 에러 모니터링 (선택)
   - 실제 사용자 플로우 테스트

### 11.3 롤백 계획

**Vercel Rollback**:
1. Vercel Dashboard → Deployments
2. 이전 성공 배포 선택
3. "Promote to Production" 클릭

**데이터베이스 롤백**:
- UC-001은 새 테이블/컬럼을 생성하지 않으므로 DB 롤백 불필요
- 만약 분석 데이터 삭제 필요 시:
  ```sql
  DELETE FROM analysis WHERE created_at > '2025-01-07';
  ```

---

## 12. 모니터링 및 로깅

### 12.1 로그 항목

**성공 케이스**:
```typescript
logger.info('Analysis created successfully', {
  userId,
  analysisId,
  testsRemaining,
  model: 'gemini-2.5-flash',
  duration: Date.now() - startTime,
});
```

**무료 체험 소진**:
```typescript
logger.warn('Free trial exhausted', {
  userId,
  testsRemaining: 0,
});
```

**AI 분석 실패**:
```typescript
logger.error('Gemini API failed after retries', {
  userId,
  error: error.message,
  retries: 3,
});
```

**DB 오류**:
```typescript
logger.error('Failed to save analysis', {
  userId,
  error: error.message,
  step: 'INSERT analysis',
});
```

### 12.2 메트릭

**Vercel Analytics**:
- `/api/analysis/generate` 응답 시간
- 에러율 (4xx, 5xx)
- 요청 수 (시간대별)

**Supabase Metrics**:
- `users` 테이블 쿼리 성능
- `analysis` 테이블 INSERT 속도
- Connection pool 사용률

**Gemini API**:
- 평균 응답 시간
- 재시도 발생 횟수
- API 할당량 사용량

---

## 13. 문서화

### 13.1 API 문서
- [ ] OpenAPI 스펙 작성 (선택)
- [ ] `/docs/api/analysis.md` 엔드포인트 문서 작성
- [ ] 예제 cURL 요청 추가

### 13.2 사용자 가이드
- [ ] `/docs/guides/free-trial.md` 무료 체험 사용 가이드
- [ ] 스크린샷 포함 (입력 폼, 로딩 화면, 결과 페이지)

---

## 14. 체크리스트

### 14.1 구현 전
- [x] 유스케이스 검토 완료 (`/docs/usecases/001/spec.md`)
- [x] 데이터베이스 스키마 확정 (`/docs/prompts/database.md`)
- [x] API 엔드포인트 설계 완료
- [x] 보안 요구사항 확인 (Clerk + Service Role)
- [x] Gemini 라이브러리 구현 확인 (`src/lib/gemini.ts`)

### 14.2 구현 중
- [ ] Phase 1: 백엔드 API 구조 완료
- [ ] Phase 2: 프론트엔드 폼 완료
- [ ] Phase 3: 에러 처리 완료
- [ ] Phase 4: 통합 테스트 완료
- [ ] 코드 리뷰 완료
- [ ] 단위 테스트 작성 및 통과

### 14.3 구현 후
- [ ] E2E 테스트 통과
- [ ] 성능 테스트 통과 (< 15초)
- [ ] 보안 검토 완료 (Clerk 세션, Service Role)
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

**Service Layer 트랜잭션 패턴**:

```typescript
// 의사코드: Gemini API → DB INSERT → DB UPDATE (원자성 보장)
async function createFreeAnalysis(supabase, userId, input) {
  try {
    // 1. AI 분석 (재시도 포함)
    const aiOutput = await generateFreeSajuAnalysis(input);

    // 2. 분석 저장
    const { data: analysis } = await supabase
      .from('analysis')
      .insert({ user_id: userId, output_markdown: aiOutput, ... })
      .select('id')
      .single();

    // 3. 체험 차감
    const { data: user } = await supabase
      .from('users')
      .update({ tests_remaining: tests_remaining - 1 })
      .eq('id', userId)
      .select('tests_remaining')
      .single();

    // 4. 실패 시 롤백
    if (!user) {
      await supabase.from('analysis').delete().eq('id', analysis.id);
      throw new Error('UPDATE_TRIALS_FAILED');
    }

    return { analysisId: analysis.id, testsRemaining: user.tests_remaining };
  } catch (error) {
    // 에러 처리 (체험권 복구 안내)
    throw error;
  }
}
```

### B. 의사결정 기록

**결정 1**: Supabase 트랜잭션 미사용, 수동 롤백 구현
- **이유**: Supabase JS SDK는 명시적 트랜잭션을 지원하지 않음
- **대안**: PostgreSQL 함수로 트랜잭션 구현 (복잡도 증가)
- **선택**: 실패 시 수동 롤백 (분석 레코드 삭제)

**결정 2**: 무료 체험 소진 시 모달 대신 페이지 리다이렉트
- **이유**: 모달은 사용자가 닫을 수 있어 전환율 낮음
- **대안**: 모달 + CTA 버튼
- **선택**: `/subscription` 페이지로 직접 이동 (`reason=trial_exhausted` 쿼리 파라미터)

**결정 3**: Gemini Flash 모델 사용
- **이유**: 무료 체험은 속도 우선 (Flash는 Pro보다 2배 빠름)
- **대안**: Pro 모델 사용 (품질 향상)
- **선택**: Flash 사용 (유료 전환 후 Pro 제공으로 차별화)

### C. 리스크 및 대응 방안

| 리스크 | 가능성 | 영향도 | 대응 방안 |
|--------|--------|--------|-----------|
| Gemini API 장애 | 중 | 높음 | 재시도 로직 + 체험권 복구 안내 + 에러 로그 모니터링 |
| Supabase 다운타임 | 낮 | 높음 | Vercel 배포 전 Supabase 상태 확인 + Rollback 준비 |
| 무료 체험 남용 | 중 | 중 | Rate limiting + Clerk 이메일 검증 필수화 |
| 분석 품질 낮음 | 중 | 중 | 프롬프트 개선 + 사용자 피드백 수집 |
| 응답 시간 초과 | 낮 | 중 | Gemini timeout 10초 설정 + 재시도 |

---

**구현 우선순위**: P0 (최우선)
**예상 구현 기간**: 5-7일
**담당자**: 백엔드 + 프론트엔드 개발자
**의존 UC**: 없음 (독립적 구현 가능)
**후속 UC**: UC-007 (분석 결과 상세 보기), UC-009 (구독 시작)
