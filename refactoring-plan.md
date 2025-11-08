# VMC SAJU 리팩토링 계획서 (YC CTO Edition)

> **관점**: YC 배치 스타트업 CTO - "Ship fast, fix what breaks"
> **원칙**: 동작하는 코드는 건드리지 않기, 버그만 즉시 수정
> **핵심 질문**: "이걸 하지 않으면 당장 무엇이 깨지나?"

---

## 🎯 핵심 결론 (TL;DR)

**즉시 수정 (30분)**:
- ✅ Issue #1: Gemini Pro 모델 버그 (프로덕션 버그, 매출 손실)

**이번 주 (1시간)**:
- ✅ Issue #5: Middleware 중복 제거 (간단, ROI 높음)
- ✅ Issue #6: Toast 설정 확인 (15분)

**보류 (동작하는 코드 = 건드리지 않음)**:
- ⏸️ Issue #2: 환경변수 패턴 (잠재적 위험 ≠ 현재 문제)
- ⏸️ Issue #3: Supabase client 중복 (혼란 ≠ 버그)
- ⏸️ Issue #4: Webhook 리팩토링 (99줄이지만 잘 동작함)
- ⏸️ Issue #7~11: 모두 Nice-to-have

**총 작업 시간**: 1.5시간 (기존 계획: 8시간)
**절감**: 6.5시간 → 다음 feature 개발에 투입

---

## 📊 Executive Summary

**코드베이스 현황**:
- 총 58개 TypeScript 파일, 3,715 라인
- Feature-based 아키텍처 (Hono + Next.js App Router)
- 11개의 코드 smell 발견 → **실제 프로덕션 버그 1건만 수정**

**왜 대부분을 보류하나?**
- 현재 앱이 잘 동작함
- 리팩토링 시간 > Feature 개발 시간
- 문제 발생 시 수정하는 것이 더 효율적 (YAGNI 원칙)
- 팀 1명일 때는 "일관성"보다 "속도"가 중요

---

## 🔥 Issue 재평가 (YC CTO Critical Review)

### ✅ SHIP NOW - Issue #1: Gemini AI 모델 버그

**긴급도**: 10/10
**복잡도**: 2/10
**작업 시간**: 30분

**YC CTO 판단**: ✅ **즉시 수정**

**이유**:
- ❌ **프로덕션 버그** - 유료 사용자가 무료 모델 사용 중
- ❌ **매출 손실** - 약속한 가치(Gemini Pro) 미제공
- ✅ **30분이면 수정 가능** - ROI 매우 높음

**문제**:
```typescript
// src/lib/gemini.ts:5-6
const GEMINI_FLASH_MODEL = "gemini-2.0-flash-exp";
const GEMINI_PRO_MODEL = "gemini-2.0-flash-exp";  // ⚠️ 버그!
```

**해결책** (문서 기준으로 수정):
```typescript
// .env.local
GEMINI_FLASH_MODEL=gemini-2.5-flash
GEMINI_PRO_MODEL=gemini-2.5-pro

// src/constants/env.ts에 추가
const serverEnvSchema = z.object({
  // ... 기존 필드들
  GEMINI_FLASH_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_PRO_MODEL: z.string().min(1).default("gemini-2.5-pro"),
});

// src/lib/gemini.ts 수정
import { env } from '@/constants/env';

const model = userPlan === 'paid'
  ? env.GEMINI_PRO_MODEL
  : env.GEMINI_FLASH_MODEL;
```

**수정 완료** (2025-01-08):
- ✅ `.env.local`에 gemini-2.5 모델 설정
- ✅ `src/constants/env.ts` default 값 수정
- ✅ `src/lib/gemini.ts` env 객체 사용

**배포 전 확인**:
- [ ] 유료 사용자로 테스트 → Pro 모델 (2.5) 응답 확인
- [ ] 무료 사용자로 테스트 → Flash 모델 (2.5) 응답 확인

---

### ✅ SHIP THIS WEEK - Issue #5: Middleware 설정 중복

**긴급도**: 5/10
**복잡도**: 2/10
**작업 시간**: 45분

**YC CTO 판단**: ✅ **이번 주 수정 (간단해서)**

**이유**:
- ✅ 작업 시간 짧음 (45분)
- ✅ Dead code 제거 (constants/auth.ts 미사용 코드)
- ✅ 회귀 리스크 낮음
- ⚠️ 하지만 **당장 필요하진 않음** - 그냥 심심풀이

**문제**:
- `middleware.ts`: `createRouteMatcher`로 public routes 정의
- `constants/auth.ts`: `PUBLIC_PATHS`, `PUBLIC_PREFIXES` 정의 → **미사용**

**해결책**:
```typescript
// constants/auth.ts - 이미 있는 코드 정리
export const PUBLIC_ROUTES = [
  "/", "/login", "/signup", "/sign-in", "/sign-up"
] as const;

export const PUBLIC_PREFIXES = [
  "/api/webhooks/", "/docs", "/images", "/static", "/_next"
] as const;

export function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTES.includes(path as any) ||
         PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix));
}

// middleware.ts - import로 변경
import { isPublicRoute } from '@/constants/auth';

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req.nextUrl.pathname)) {
    auth().protect();
  }
});
```

---

### ✅ QUICK FIX - Issue #6: Toast 설정 확인

**긴급도**: 5/10
**복잡도**: 1/10
**작업 시간**: 10분

**YC CTO 판단**: ✅ **확인만 하기** (수정은 필요 시)

**문제**:
```typescript
// hooks/use-toast.ts:11-12
const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000  // 16.6분?!
```

**액션**:
1. 사용자에게 질문: "Toast가 16분 동안 남아있는 게 의도한 건가요?"
2. 버그면 → `const TOAST_REMOVE_DELAY = 5000` (5초)
3. 의도된 거면 → 주석 추가

---

### ⏸️ DEFER - Issue #2: 환경변수 접근 패턴

**긴급도**: 9/10 → **재평가: 4/10**
**복잡도**: 4/10
**작업 시간**: 2시간

**YC CTO 판단**: ⏸️ **보류** (오버엔지니어링)

**재평가 이유**:
- ✅ 현재 빌드 **잘 됨** (에러 없음)
- ✅ 앱 **정상 동작** (런타임 크래시 없음)
- ✅ `constants/env.ts` 이미 잘 구조화됨
- ⚠️ "잠재적 위험" ≠ "현재 문제"

**"보안/런타임 위험"이라고 했지만...**:
- `process.env.NEXT_PUBLIC_SUPABASE_URL!` - Non-null assertion이지만 `.env.local` 있으면 OK
- "Client build에서 에러 가능성" - 가능성이지 실제 발생 안 함
- 6개 파일 수정 + 회귀 테스트 = **2시간 + 리스크**

**더 나은 전략**:
- 새 코드는 `env` 객체 사용 (이미 Gemini에서 사용 중)
- 기존 코드는 **건드리지 않음**
- 실제 빌드 에러 발생하면 그때 수정

**보류 기준**: "If it ain't broke, don't fix it"

---

### ⏸️ DEFER - Issue #3: Supabase Client 중복

**긴급도**: 7/10 → **재평가: 3/10**
**복잡도**: 6/10
**작업 시간**: 3시간 + 회귀 테스트

**YC CTO 판단**: ⏸️ **보류** (혼란 ≠ 버그)

**재평가 이유**:
- ✅ 5개 client 모두 **정상 동작**
- ✅ 팀 1명 → "온보딩 혼란" 없음
- ✅ 잘못된 client 사용 사례 **0건**
- ⚠️ 3시간 + 10+ 파일 영향 + Medium 리스크

**"DRY 위반"이지만...**:
- 각 client가 서로 다른 용도 (server/browser/service role)
- 중복 = 나쁜 것 ❌, 불필요한 중복 = 나쁜 것 ✅
- 현재는 **필요한 분리**일 수 있음

**더 나은 전략**:
- `lib/supabase/README.md` 생성:
  ```md
  # Supabase Clients Guide

  ## When to use which?
  - `createServerClient()` (server.ts) - API routes, server components
  - `createBrowserClient()` (browser-client.ts) - Client components
  - `createServiceClient()` (backend/supabase) - Hono backend with RLS bypass

  ## Why multiple clients?
  - Different auth strategies (service role vs anon key)
  - Different session handling (persist vs no-persist)
  ```
- 리팩토링은 **팀 확장 시** (2명 이상)

**보류 기준**: "Documentation > Premature refactoring"

---

### ⏸️ DEFER - Issue #4: Webhook 아키텍처

**긴급도**: 6/10 → **재평가: 2/10**
**복잡도**: 5/10
**작업 시간**: 2.5시간

**YC CTO 판단**: ⏸️ **보류** (아키텍처 순수성 < 속도)

**재평가 이유**:
- ✅ Webhook **정상 동작** (Clerk 동기화 성공)
- ✅ 99줄이지만 **읽기 쉬움** (단일 파일에 모든 로직)
- ✅ 테스트는 E2E로 충분 (단위 테스트 = 오버엔지니어링)
- ⚠️ "Feature-based 구조 위반" - 아키텍처 순수성 vs 실용성

**"Service layer 분리" 필요성**:
- Webhook 1개 → Service layer 불필요
- Webhook 3개+ → 그때 리팩토링
- **YAGNI**: You Ain't Gonna Need It

**더 나은 전략**:
- 현재 코드 유지
- **다음 webhook 추가 시** (TossPayments, Cron) 패턴 파악 후 리팩토링
- 그때 공통 패턴이 보이면 추상화

**보류 기준**: "Wait for the pattern to emerge"

---

### ⏸️ DEFER - Issue #7~11: 나머지

**YC CTO 판단**: ⏸️ **모두 보류**

| Issue | 이유 |
|-------|------|
| #7 긴 파일 분리 | 동작함, 재사용 없음, 시간 낭비 |
| #8 로깅 통일 | Vercel 로그 충분, 오버엔지니어링 |
| #9 에러 타입 | Type narrowing 충분, 실제 에러 없음 |
| #10 Config 중복 | 동작함, Issue #2 보류로 자동 보류 |
| #11 Feature 모듈 | 리팩토링 아님, 신규 개발 시 올바른 구조로 |

---

### 📋 NEW - Issue #12: Gemini 프롬프트 전략 미구현

**긴급도**: 7/10
**복잡도**: 7/10
**작업 시간**: 4-6시간

**YC CTO 판단**: 📝 **문서화 후 신규 개발 시 적용**

**문제**:
- `.claude/skills/saju-saas-skill/references/prompts.md`에 상세한 프롬프트 전략이 문서화되어 있으나 **미구현**
- 현재 코드는 간소화된 일일 운세 프롬프트만 있음

**현재 상태 vs 문서**:

| 항목 | 문서 | 실제 코드 | 상태 |
|------|------|-----------|------|
| **Initial Analysis 프롬프트** | 200+ 줄 상세 템플릿 | ❌ 없음 | 미구현 |
| **Daily Fortune 프롬프트** | 100+ 줄 구조화 | △ 간소화 버전 | 부분 구현 |
| **JSON 응답 처리** | 구조화된 JSON | ❌ text만 반환 | 미구현 |
| **Response Validation** | `validateAnalysisJson()` | ❌ 없음 | 미구현 |
| **System Instructions** | 명확한 역할 정의 | △ 프롬프트 내 포함 | 부분 구현 |
| **Timeout Handling** | 30초 timeout | ✅ 구현됨 (retry 있음) | 구현 |

**누락된 기능**:

1. **Initial Analysis 프롬프트** (`.claude/skills/.../prompts.md:64-149`):
   - 천간지지 분석
   - 오행 균형 판단
   - 용신 판단
   - 운세 분야별 점수 (Career, Wealth, Health, Relationship)
   - 행운 요소 (색상, 방위, 숫자, 띠)
   - JSON 형식 응답

2. **JSON 응답 구조**:
   ```typescript
   // 문서에 명시된 응답 형식 (prompts.md:258-281)
   {
     "date": "2025-01-08",
     "overall_score": 75,
     "time_slots": {
       "morning": { "score": 80, "advice": "조언" },
       "afternoon": { "score": 70, "advice": "조언" },
       "evening": { "score": 75, "advice": "조언" }
     },
     "aspects": {
       "career": 80,
       "wealth": 70,
       "relationship": 75,
       "health": 85
     },
     "actions": ["행동1", "행동2", "행동3"],
     "lucky_elements": {
       "color": "파란색",
       "direction": "동쪽",
       "time": "오전 9-11시",
       "keyword": "소통"
     }
   }
   ```

3. **Response Validation** (prompts.md:407-436)
4. **API 엔드포인트** (`/api/analysis/generate`) - prompts.md:462-589

**YC CTO 판단 이유**:
- ✅ 현재 프롬프트도 **동작은 함**
- ⚠️ 하지만 문서와 불일치 → **혼란 야기**
- ⚠️ JSON 응답 없음 → 프론트엔드 활용 제한
- 📝 **리팩토링보다는 신규 feature 개발**로 봐야 함
- 💰 4-6시간 투자 vs 즉시 비즈니스 영향 낮음

**더 나은 전략**:

1. **지금**: 문서화만 하기
   - `docs/gemini-prompts-todo.md` 생성
   - 구현 필요 항목 리스트업
   - 우선순위 정의

2. **다음 feature 개발 시**: 점진적 적용
   - 사주 분석 기능 구현할 때 Initial Analysis 프롬프트 추가
   - JSON 응답 필요해지면 그때 구현
   - Validation은 실제 오류 발생 시 추가

3. **보류 기준**: "Working code > Perfect documentation"
   - 문서는 **이상적인 목표**
   - 코드는 **현재 동작하는 최소 기능**
   - MVP 단계에서는 간소화된 버전으로 충분

**액션**:
- ✅ 모델명을 2.5로 수정 (완료)
- 📝 `docs/gemini-prompts-todo.md` 생성 (선택사항)
- 🚀 실제 사주 분석 기능 구현 시 문서 참고

**트리거 조건**:
- 사주 분석 API 엔드포인트 구현할 때
- 프론트엔드에서 구조화된 데이터 필요할 때
- 유저 피드백으로 분석 품질 개선 필요할 때

---

## 📋 최종 실행 계획 (단순화)

### ✅ Phase 1: 즉시 (30분)

| 작업 | 시간 | 파일 | 리스크 |
|------|------|------|--------|
| Gemini 모델 버그 수정 | 30분 | 2개 | Low |

**배포 체크리스트**:
- [ ] `.env.local`에 `GEMINI_PRO_MODEL` 추가 (선택)
- [ ] 유료/무료 사용자 테스트
- [ ] Vercel 배포

---

### ✅ Phase 2: 이번 주 (1시간)

| 작업 | 시간 | 파일 | 리스크 |
|------|------|------|--------|
| Middleware 중복 제거 | 45분 | 2개 | Low |
| Toast 설정 확인 | 10분 | 1개 | Low |

**배포 체크리스트**:
- [ ] Auth flow 테스트 (protected/public routes)
- [ ] Toast 동작 확인

---

### ⏸️ Phase 3: 보류 (언제 할 것인가?)

| Issue | 트리거 조건 |
|-------|------------|
| #2 환경변수 | Client build 에러 발생 시 |
| #3 Supabase | 팀원 2명 이상 되면 |
| #4 Webhook | 2번째 webhook 추가 시 |
| #7 긴 파일 | 컴포넌트 재사용 필요 시 |
| #8 로깅 | 로그 분석 필요해지면 |
| #9 에러 타입 | 런타임 에러 발생 시 |
| #10 Config | Issue #2 진행 시 |
| #11 Feature | 다음 feature 개발 시 |
| **#12 Gemini 프롬프트** | **사주 분석 API 구현 시, JSON 응답 필요 시** |

---

## 🧪 테스트 전략 (최소화)

### Issue #1: Gemini 모델
```bash
# Manual test (30초)
# 1. 유료 사용자로 로그인
# 2. AI 분석 요청
# 3. 응답 모델 확인 (Pro여야 함)

# 4. 무료 사용자로 로그인
# 5. AI 분석 요청
# 6. 응답 모델 확인 (Flash여야 함)
```

**단위 테스트는 Skip** (프로덕션 검증이 더 빠름)

### Issue #5: Middleware
```bash
# E2E test (1분)
# 1. 로그아웃 상태에서 /dashboard 접근 → /login으로 리다이렉트
# 2. 로그아웃 상태에서 / 접근 → 정상 표시
# 3. 로그인 후 /dashboard 접근 → 정상 표시
```

---

## 💡 의사결정 프레임워크

### 리팩토링 해야 하는 경우:
1. ✅ **프로덕션 버그** (매출, 보안, 크래시)
2. ✅ **매우 간단** (30분 이하) + 낮은 리스크
3. ✅ **새 feature 개발 막힘** (현재는 해당 없음)

### 리팩토링 하지 말아야 하는 경우:
1. ❌ "잠재적 위험" (실제 발생 안 함)
2. ❌ "아키텍처 순수성" (비즈니스 영향 없음)
3. ❌ "온보딩 혼란" (팀 1명)
4. ❌ "나중에 문제될 수 있음" (YAGNI)
5. ❌ 작업 시간 > 1시간 + 회귀 리스크

---

## 📈 ROI 분석

### 기존 계획 (8시간)
| 작업 | 시간 | 비즈니스 영향 | ROI |
|------|------|--------------|-----|
| Gemini 버그 | 30분 | ⭐⭐⭐⭐⭐ 매출 | 높음 |
| 환경변수 | 2시간 | ⭐ 잠재적 위험 | 낮음 |
| Supabase | 3시간 | ⭐ 혼란 감소 | 낮음 |
| Webhook | 2.5시간 | ⭐ 아키텍처 | 낮음 |

**총 8시간 → 실질적 영향 30분치만**

### 새 계획 (1.5시간)
| 작업 | 시간 | 비즈니스 영향 | ROI |
|------|------|--------------|-----|
| Gemini 버그 | 30분 | ⭐⭐⭐⭐⭐ 매출 | 높음 |
| Middleware | 45분 | ⭐⭐ 코드 정리 | 중간 |
| Toast 확인 | 10분 | ⭐⭐ UX | 중간 |

**총 1.5시간 → 절감된 6.5시간은 Feature 개발**

---

## 🎯 결론: What to Ship

### Ship Now (30분)
```bash
# 1. Gemini 모델 수정
git checkout -b fix/gemini-model-bug
# src/constants/env.ts - GEMINI_PRO_MODEL 추가
# src/lib/gemini.ts - env import로 변경
git commit -m "Fix: Use correct Gemini Pro model for paid users"
git push
```

### Ship This Week (1시간)
```bash
# 2. Middleware 중복 제거 (심심하면)
git checkout -b refactor/middleware-config
# constants/auth.ts 정리
# middleware.ts import로 변경
git commit -m "Refactor: Consolidate public route config"

# 3. Toast 확인 (사용자에게 질문 먼저)
```

### Don't Ship (보류)
- Issue #2, #3, #4: 다음에
- Issue #7~11: 아마도 안 함

---

## 📚 새 개발 가이드라인

### When writing NEW code:
```
✅ DO:
- Import from @/constants/env (not process.env)
- Follow feature-based structure
- Keep functions under 50 lines
- Write E2E tests for critical paths

❌ DON'T:
- Refactor working code "just because"
- Add abstractions for single use case
- Write unit tests for everything (E2E > unit for startups)
- Spend >1 hour on "nice to have"
```

### When to refactor EXISTING code:
```
✅ Refactor when:
- Adding 2nd occurrence (not 1st)
- Fixing bug anyway (piggyback)
- Code blocks new feature

❌ Don't refactor when:
- Code works fine
- "Might need it later"
- "Not clean code"
- "Inconsistent with new pattern"
```

---

## 🚀 Next Steps

1. ✅ **Now**: Gemini 버그 수정 (30분)
2. ✅ **This week**: Middleware 정리 (45분)
3. 📝 **Document**: Supabase client README 작성 (15분)
4. 🚀 **Ship**: 다음 feature 개발 (절감된 6.5시간 투입)

---

## 📞 Appendix: 보류 결정 상세 근거

### Issue #2: 환경변수 패턴

**원래 주장**:
- "런타임 크래시 가능성" - 하지만 발생 안 함
- "보안 위험" - 하지만 실제 사례 없음
- "빌드 실패" - 하지만 빌드 성공

**YC CTO 반박**:
- 가능성 ≠ 확률
- Non-null assertion은 `.env.local` 있으면 안전
- 2시간 투자 > 0 임팩트 = 나쁜 ROI

**학습**:
- "Potential issue" 조심 - 실제 발생 전까지 무시
- Type safety는 좋지만 스타트업에서 우선순위 낮음

---

### Issue #3: Supabase Client

**원래 주장**:
- "5개 중복" - 하지만 용도가 다름
- "온보딩 혼란" - 팀 1명
- "유지보수 비용" - 실제 변경 빈도 0

**YC CTO 반박**:
- 중복 ≠ 나쁨 (필요한 분리 vs 불필요한 중복)
- 3시간 리팩토링 vs 15분 문서화
- 회귀 리스크 > 명확성 이득

**학습**:
- DRY는 좋은 원칙이지만 맹목적 적용 금지
- 문서 > 리팩토링 (빠르고 안전)

---

### Issue #4: Webhook 구조

**원래 주장**:
- "Feature-based 위반" - 아키텍처 순수성
- "99줄" - 하지만 읽기 쉬움
- "테스트 불가능" - E2E는 가능

**YC CTO 반박**:
- 아키텍처 일관성 < 빠른 shipping
- Service layer는 webhook 3개+ 되면 추가
- "Wait for the pattern" > "Anticipate the pattern"

**학습**:
- Rule of Three: 3번 반복되면 추상화
- 1-2개일 때 추상화 = 추측성 설계

---

**문서 버전**: 2.0 (YC CTO Reviewed)
**작성일**: 2025-01-08
**리뷰**: 오버엔지니어링 제거, ROI 중심 재구성
**총 작업 시간**: 8시간 → 1.5시간 (81% 절감)
**절감된 시간**: Feature 개발 투입
