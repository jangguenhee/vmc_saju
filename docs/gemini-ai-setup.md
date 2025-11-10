# Gemini AI 분석 설정 가이드

Gemini AI를 사용하여 사주 분석 기능을 구현하는 방법을 안내합니다.

---

## 1. 필수 조건

- ✅ Google AI Studio 계정
- ✅ Gemini API Key 발급
- ✅ Supabase 데이터베이스 설정 완료
- ✅ Clerk 인증 설정 완료

---

## 2. Gemini API Key 발급

### Step 1: Google AI Studio 접속

1. https://makersuite.google.com/app/apikey 방문
2. Google 계정으로 로그인

### Step 2: API Key 생성

1. **"Create API Key"** 클릭
2. 프로젝트 선택 (또는 새 프로젝트 생성)
3. API Key 복사 (형식: `AIzaSy...`)

### Step 3: 환경 변수 설정

`.env.local` 파일에 추가:

```bash
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

⚠️ **주의**: 이 키는 절대 Git에 커밋하지 마세요!

---

## 3. 구현 구조

### 파일 구조

```
src/
├── lib/gemini/
│   ├── client.ts       # Gemini 클라이언트 설정
│   ├── prompts.ts      # 프롬프트 템플릿
│   └── generate.ts     # 분석 생성 함수
└── app/api/analysis/
    ├── create/route.ts # 분석 생성 API
    └── [id]/route.ts   # 분석 조회 API
```

### AI 모델 구분

| 사용자 타입 | 모델 | 용도 |
|-------------|------|------|
| **무료 사용자** | `gemini-2.0-flash-exp` | 빠른 기본 분석 (3회 제한) |
| **유료 사용자** | `gemini-2.0-flash-thinking-exp-1219` | 상세한 일일 운세 |

---

## 4. API 엔드포인트

### POST /api/analysis/create

사주 분석 생성

**Request**:
```json
{
  "name": "홍길동",
  "birthDate": "1990-01-01",
  "birthTime": "14:30",
  "gender": "male"
}
```

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "analysisType": "free",
    "aiModel": "gemini-2.5-flash",
    "resultText": "# 사주 분석 결과...",
    "resultJson": { ... },
    "createdAt": "2025-11-08T..."
  },
  "testsRemaining": 2
}
```

**Response** (무료 체험 소진):
```json
{
  "success": false,
  "error": "FREE_TRIAL_EXHAUSTED",
  "message": "무료 체험 횟수를 모두 사용했습니다. 구독을 시작해보세요!",
  "testsRemaining": 0
}
```

### GET /api/analysis/[id]

분석 결과 조회

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "input": { "name": "...", "birthDate": "..." },
    "output_markdown": "# 사주 분석...",
    "model": "gemini-2.5-flash",
    "type": "free",
    "created_at": "..."
  },
  "user": {
    "plan": "free",
    "testsRemaining": 2
  }
}
```

---

## 5. 프롬프트 전략

### 무료 사용자 프롬프트 (Initial Analysis)

```
# 사주 기본 정보
- 이름: 홍길동
- 생년월일: 1990-01-01 (양력)
- 출생 시간: 14:30
- 성별: 남성

# 분석 요청
1. 기본 사주 구조 (천간, 지지, 오행)
2. 성격 및 기질
3. 운세 분야별 분석 (직업, 재물, 건강, 애정)
4. 행운 요소
5. 주의 및 경계 사항
6. 종합 조언
```

### 유료 사용자 프롬프트 (Daily Fortune)

```
# 오늘의 일일 운세
- 전체운
- 시간대별 운세 (오전/오후/저녁)
- 주요 운세 (업무, 금전, 대인관계, 건강)
- 실천 사항
- 행운 키워드
```

---

## 6. 에러 핸들링

### 재시도 로직 (Exponential Backoff)

```typescript
// 최대 3회 재시도, 지수 백오프 (1s, 2s, 4s)
const result = await generateWithRetry(options, 3);
```

### 타임아웃 설정

```typescript
// 30초 타임아웃
const result = await generateWithTimeout(options, 30000);
```

### 응답 검증

```typescript
// JSON 구조 검증
if (!validateAnalysisJson(json, 'initial')) {
  throw new Error('AI 응답 형식이 올바르지 않습니다.');
}
```

---

## 7. 비용 최적화

### 토큰 사용량 예상

| 분석 타입 | 입력 토큰 | 출력 토큰 | 총 토큰 |
|----------|----------|----------|---------|
| 무료 (Initial) | ~500 | ~3000 | ~3500 |
| 유료 (Daily) | ~1000 | ~2000 | ~3000 |

### 월간 비용 예측 (사용자 1,000명)

```
무료 사용자 (3,000명 × 3회):
- 9,000 requests × 3,500 tokens = 31.5M tokens

유료 사용자 (1,000명 × 30일):
- 30,000 requests × 3,000 tokens = 90M tokens

Total: ~121.5M tokens/month
```

**Gemini 2.0 Flash 가격**: $0.075 per 1M tokens
**월간 예상 비용**: ~$9.11

---

## 8. 테스트 방법

### 로컬 테스트

```bash
# 개발 서버 실행
npm run dev

# /new 페이지 접속
# 사주 정보 입력 후 "AI 사주 분석 시작하기" 클릭
```

### 콘솔 로그 확인

```
[Analysis API] Generating free analysis for user: user_xxxxx
[Gemini] Attempt 1 succeeded
[Analysis API] ✅ Analysis created: uuid-here (2543ms)
```

### 데이터베이스 확인

Supabase Dashboard → Table Editor → `analysis` 테이블

```sql
SELECT * FROM analysis ORDER BY created_at DESC LIMIT 5;
```

---

## 9. 트러블슈팅

### ❌ Missing GEMINI_API_KEY

**원인**: 환경 변수 미설정

**해결**:
```bash
# .env.local 파일 확인
GEMINI_API_KEY=AIzaSy...

# 개발 서버 재시작
npm run dev
```

### ❌ AI_GENERATION_FAILED

**원인**: Gemini API 호출 실패

**해결**:
1. API Key 유효성 확인
2. 네트워크 연결 확인
3. Gemini API 할당량 확인 (https://makersuite.google.com)

### ❌ AI_VALIDATION_FAILED

**원인**: AI 응답 형식이 예상과 다름

**해결**:
1. 프롬프트 템플릿 검토
2. `validateAnalysisJson` 함수 로직 확인
3. 모델 응답 로그 확인

### ❌ DAILY_LIMIT_REACHED

**원인**: 유료 사용자가 당일 이미 분석 생성함

**해결**: 정상 동작입니다 (하루 1회 제한)

---

## 10. 다음 단계

AI 분석 API가 정상 작동하면:

- ✅ 1단계: 데이터베이스 설정 완료
- ✅ 2단계: Clerk 웹훅 연동 완료
- ✅ 3단계: AI 분석 API 구현 완료
- ⬜ 4단계: 구독 관리 API 구현 (`/api/subscription/`)
- ⬜ 5단계: Cron 자동화 구현 (일일 리포트 자동 생성)

---

## 11. 참고 문서

- [Gemini API 공식 문서](https://ai.google.dev/tutorials/node_quickstart)
- [프롬프트 엔지니어링 가이드](https://ai.google.dev/docs/prompt_best_practices)
- [AI Analysis Prompts](/.claude/skills/saju-saas-skill/references/prompts.md)
- [API Specification](/.claude/skills/saju-saas-skill/references/api-spec.md)
