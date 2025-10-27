# User Flow
## 365일 사주 - AI 운세 구독 SaaS

**Version**: 1.0.0  
**Date**: 2025-10-27  
**Status**: Ready for Database Design

---

## Overview

**365일 사주**는 Google Gemini AI 기반의 사주팔자 분석을 구독형으로 제공하는 SaaS입니다. 사용자는 무료 체험(3회)을 통해 AI 운세의 품질을 경험하고, 월 ₩3,650 구독으로 매일 자동 생성되는 개인 맞춤 운세 리포트를 받습니다.

### Core User Journey

```
방문 → 로그인 → 무료 체험 (3회) → 가치 체감 → 구독 전환 → 매일 리포트 수신
```

---

## Feature List

| ID | Feature | Priority | User Type |
|----|---------|----------|-----------|
| 001 | 랜딩 페이지 방문 | P0 | Anonymous |
| 002 | Google 로그인 (Clerk) | P0 | Anonymous |
| 003 | 신규 회원 자동 등록 | P0 | New User |
| 004 | 대시보드 진입 | P0 | Authenticated |
| 005 | AI 사주 분석 요청 (무료 체험) | P0 | Free User |
| 006 | AI 사주 분석 요청 (구독자) | P0 | Pro User |
| 007 | 분석 결과 상세 보기 | P0 | Authenticated |
| 008 | 분석 결과 공유 | P1 | Authenticated |
| 009 | 구독 시작 (결제) | P0 | Free User |
| 010 | 구독 관리 (해지/재결제) | P0 | Pro User |
| 011 | 매일 자동 리포트 생성 (cron) | P0 | System |
| 012 | 정기결제 자동화 (cron) | P0 | System |

---

## 001. 랜딩 페이지 방문

**Actor**: 익명 방문자 (Anonymous Visitor)

**Trigger**: 사용자가 `https://vcm-saju.vercel.app` 접속

**User Goal**: 서비스가 무엇인지 이해하고 무료 체험 시작 결정

**Main Flow**:
1. 사용자가 랜딩 페이지 접속
2. 시스템이 오방색(청·적·황·백·흑) 애니메이션 배경 표시
3. 헤드라인 표시: "당신의 사주, AI가 분석합니다"
4. 서브텍스트: "당신의 전 생애에 걸친 일간(日干) 일주를 매일 AI로 분석합니다"
5. 서비스 핵심 가치 카드 3개 표시:
   - AI 분석의 정밀함
   - 맞춤형 리포트
   - 간편한 구독관리
6. 사용자가 "무료로 시작하기" CTA 버튼 확인

**Expected Outcome**:
- 사용자가 "AI 기반 사주 구독 서비스"임을 10초 내 인식
- "무료 체험 3회 가능"을 명확히 이해
- 로그인 의향 생김

**UI Components**:
- Hero 섹션 (오방색 배경 애니메이션)
- CTA 버튼: "무료로 시작하기"
- 가치 제안 카드 3개
- 내비게이션: 홈 | 서비스 | 복채 | FAQ

---

## 002. Google 로그인 (Clerk)

**Actor**: 익명 방문자

**Trigger**: "무료로 시작하기" 버튼 클릭

**User Goal**: Google 계정으로 간편하게 로그인

**Main Flow**:
1. 사용자가 "무료로 시작하기" 클릭
2. Clerk Google OAuth 팝업 표시
3. 사용자가 Google 계정 선택
4. Google이 사용자 인증 완료
5. Clerk가 세션 생성
6. 시스템이 `/dashboard`로 리다이렉트

**Edge Cases**:
- Google 인증 취소 → 랜딩 페이지로 복귀
- 네트워크 오류 → 재시도 안내
- 이미 로그인 상태 → `/dashboard`로 즉시 이동

**Expected Outcome**:
- 사용자가 별도 회원가입 절차 없이 로그인 완료
- Clerk 세션 유지 (새로고침 후에도)

**External Services**:
- **Clerk SDK**: Google OAuth 처리
- **Google OAuth 2.0**: 사용자 인증

---

## 003. 신규 회원 자동 등록

**Actor**: 시스템 (Clerk Webhook)

**Trigger**: Clerk `user.created` 이벤트 수신

**System Goal**: 신규 사용자를 Supabase에 등록하고 무료 체험 3회 부여

**Main Flow**:
1. Clerk가 `user.created` webhook 전송
2. `/api/webhooks/clerk` 엔드포인트가 요청 수신
3. Webhook 서명 검증
4. Supabase `users` 테이블에 신규 사용자 삽입:
   ```sql
   INSERT INTO users (id, email, plan, tests_remaining)
   VALUES (clerk_user_id, user_email, 'free', 3)
   ```
5. 등록 완료 로그 기록

**Edge Cases**:
- 중복 가입 시도 → UNIQUE 제약으로 차단
- Webhook 서명 불일치 → 401 Unauthorized 응답
- Supabase 연결 오류 → 재시도 로직

**Expected Outcome**:
- Supabase에 신규 사용자 레코드 생성
- 무료 체험 3회 자동 부여
- 사용자는 `/dashboard`에서 바로 서비스 이용 가능

**Database Operations**:
- **INSERT**: `users` 테이블 (id, email, plan='free', tests_remaining=3)

**External Services**:
- **Clerk Webhook**: 사용자 생성 이벤트

---

## 004. 대시보드 진입

**Actor**: 인증된 사용자 (Authenticated User)

**Trigger**: 로그인 완료 후 자동 리다이렉트 또는 헤더의 "대시보드" 클릭

**User Goal**: 현재 플랜 상태, 분석 히스토리, 오늘의 사주 확인

**Main Flow**:
1. 사용자가 `/dashboard` 접속
2. 시스템이 Clerk 세션 검증
3. Supabase에서 사용자 정보 조회:
   ```sql
   SELECT * FROM users WHERE id = $user_id
   ```
4. 분석 히스토리 조회 (최신 10개):
   ```sql
   SELECT * FROM analysis 
   WHERE user_id = $user_id 
   ORDER BY created_at DESC 
   LIMIT 10
   ```
5. 플랜에 따라 상태 카드 표시:
   - **무료**: "무료 체험 중 (남은 X회)"
   - **유료**: "365일 운세 구독 중" + 다음 결제일
6. 분석 히스토리 카드 렌더링
7. 구독자인 경우 "오늘의 사주" 위젯 표시

**Expected Outcome**:
- 사용자가 자신의 플랜 상태를 즉시 인식
- 과거 분석 내역 확인 가능
- 다음 액션(분석 요청 또는 구독) 결정

**UI Components**:
- 상태 카드 (플랜, 잔여 횟수/결제일)
- CTA 버튼 (무료: "365일 운세 시작하기" / 유료: "오늘의 사주 받기")
- 분석 히스토리 카드 리스트
- "오늘의 사주" 위젯 (유료만)

**Database Operations**:
- **SELECT**: `users` 테이블 (사용자 정보)
- **SELECT**: `analysis` 테이블 (분석 히스토리)

---

## 005. AI 사주 분석 요청 (무료 체험)

**Actor**: 무료 사용자 (Free User)

**Trigger**: 대시보드에서 "오늘의 사주 받기" 클릭 또는 `/new` 페이지 직접 접속

**User Goal**: 생년월일 정보를 입력하여 AI 사주 분석 결과 받기

**Main Flow**:
1. 사용자가 `/new` 페이지 접속
2. 입력 폼 표시:
   - 이름 (필수)
   - 생년월일 (필수, YYYY-MM-DD)
   - 출생시간 (선택, "모름" 옵션 포함)
   - 성별 (필수, 남성/여성)
3. 사용자가 정보 입력 후 "AI 사주 분석 시작하기" 클릭
4. 시스템이 입력 값 유효성 검증
5. Supabase에서 `tests_remaining` 확인:
   ```sql
   SELECT tests_remaining FROM users WHERE id = $user_id
   ```
6. 잔여 횟수 확인:
   - `tests_remaining > 0` → 진행
   - `tests_remaining = 0` → "무료 체험 소진" 모달 표시 → `/subscription`로 유도
7. 로딩 화면 표시:
   - "천간과 지지를 해석하는 중..."
   - "오행의 균형을 분석하고 있습니다..."
   - "오늘의 운세를 정리하는 중..."
8. Gemini Flash 모델 호출:
   ```typescript
   const result = await gemini.generateContent({
     model: 'gemini-2.5-flash',
     prompt: generateSajuPrompt(input)
   });
   ```
9. AI 응답을 Supabase `analysis` 테이블에 저장:
   ```sql
   INSERT INTO analysis (user_id, input, output_markdown, model, type)
   VALUES ($user_id, $input_json, $ai_output, 'gemini-2.5-flash', 'free')
   ```
10. `tests_remaining` 차감:
    ```sql
    UPDATE users 
    SET tests_remaining = tests_remaining - 1 
    WHERE id = $user_id
    ```
11. `/analysis/[id]` 페이지로 리다이렉트

**Edge Cases**:
- 무료 체험 소진 → 모달: "무료 체험이 모두 소진되었습니다" + "365일 운세 시작하기" CTA
- Gemini API 오류 → `tests_remaining` 복구 + "다시 분석하기" 버튼
- 네트워크 타임아웃 → 입력값 localStorage 저장 + 복구 안내
- 입력 유효성 실패 → 인라인 에러 메시지

**Expected Outcome**:
- 사용자가 AI 생성 사주 분석 결과 획득
- 무료 체험 1회 차감
- 분석 결과가 히스토리에 저장됨

**Database Operations**:
- **SELECT**: `users.tests_remaining` (잔여 확인)
- **INSERT**: `analysis` 테이블 (분석 결과 저장)
- **UPDATE**: `users.tests_remaining` (1 차감)

**External Services**:
- **Gemini API**: `gemini-2.5-flash` 모델로 사주 분석

---

## 006. AI 사주 분석 요청 (구독자)

**Actor**: 유료 구독자 (Pro User)

**Trigger**: 대시보드에서 "오늘의 사주 받기" 클릭 (하루 1회 제한)

**User Goal**: 오늘의 운세 분석 받기

**Main Flow**:
1. 사용자가 "오늘의 사주 받기" 클릭
2. 시스템이 오늘 이미 생성했는지 확인:
   ```sql
   SELECT * FROM analysis 
   WHERE user_id = $user_id 
     AND type = 'daily' 
     AND DATE(created_at) = CURRENT_DATE
   ```
3. 이미 존재하면:
   - 해당 분석 결과로 즉시 이동
   - 토스트: "오늘의 사주가 이미 생성되었습니다"
4. 없으면 신규 생성:
   - 사용자의 저장된 생년월일 정보 조회
   - Gemini Pro 모델 호출:
     ```typescript
     const result = await gemini.generateContent({
       model: 'gemini-2.5-pro',
       prompt: generateDailySajuPrompt(userBirthInfo, today)
     });
     ```
   - `analysis` 테이블에 저장 (type='daily')
5. `/analysis/[id]`로 리다이렉트

**Edge Cases**:
- 생년월일 미등록 → `/profile`로 유도하여 정보 입력 요청
- Gemini API 오류 → 재시도 안내
- 하루 1회 제한 → 이미 생성된 결과로 이동

**Expected Outcome**:
- 유료 사용자가 매일 새로운 AI 분석 획득
- Gemini Pro 모델로 더 정밀한 분석 제공
- 하루 1회 생성 제한으로 API 비용 관리

**Database Operations**:
- **SELECT**: `analysis` (오늘 생성 여부 확인)
- **SELECT**: `users` (생년월일 정보)
- **INSERT**: `analysis` (type='daily')

**External Services**:
- **Gemini API**: `gemini-2.5-pro` 모델

---

## 007. 분석 결과 상세 보기

**Actor**: 인증된 사용자

**Trigger**: 대시보드에서 분석 카드 클릭 또는 "오늘의 사주" 위젯 클릭

**User Goal**: AI가 생성한 사주 분석 내용을 자세히 읽기

**Main Flow**:
1. 사용자가 `/analysis/[id]` 접속
2. Supabase에서 분석 결과 조회:
   ```sql
   SELECT * FROM analysis WHERE id = $analysis_id AND user_id = $user_id
   ```
3. 상단 정보 패널 표시:
   - 입력 정보 (이름, 생년월일, 출생시간, 성별)
   - 분석일
   - 플랜 상태 배너
4. Markdown 본문 렌더링:
   - 섹션: 천간/지지 해석, 오행 분석, 오늘의 운세, 행운 포인트, AI 조언
5. 무료 사용자인 경우:
   - 일부 섹션 잠금 (대운/세운 비활성화)
   - "365일 운세 시작하기" CTA 표시
6. 하단 액션 버튼:
   - "목록으로"
   - "다시 분석하기"
   - "공유하기"

**Expected Outcome**:
- 사용자가 AI 분석 결과를 가독성 높게 열람
- 무료 사용자는 프리미엄 섹션 잠금으로 구독 유도
- 공유 기능으로 신규 유입 기대

**UI Components**:
- 상단 정보 패널 (sticky)
- Markdown 렌더링 영역
- 잠금 섹션 (무료 사용자)
- 하단 고정 버튼 바

**Database Operations**:
- **SELECT**: `analysis` (분석 결과 조회)

---

## 008. 분석 결과 공유

**Actor**: 인증된 사용자

**Trigger**: 분석 상세 페이지에서 "공유하기" 클릭

**User Goal**: 분석 결과를 SNS로 공유하여 지인에게 알리기

**Main Flow**:
1. 사용자가 "공유하기" 클릭
2. 공유 옵션 모달 표시:
   - 링크 복사
   - 카카오톡
   - 페이스북
   - 트위터
3. 사용자가 공유 방식 선택
4. 공유용 URL 생성: `https://vcm-saju.vercel.app/analysis/[id]`
5. 무료 사용자 공유 시:
   - "무료 체험 3회" 홍보 문구 포함
6. 구독자 공유 시:
   - "AI 사주 리포트 - 오늘의 운세" 카드 미리보기

**Expected Outcome**:
- 사용자가 결과를 쉽게 공유
- 공유 링크를 통한 신규 방문자 유입
- 바이럴 마케팅 효과

**UI Components**:
- 공유 모달
- SNS 공유 버튼
- 링크 복사 버튼

---

## 009. 구독 시작 (결제)

**Actor**: 무료 사용자

**Trigger**: 무료 체험 소진 후 또는 대시보드에서 "365일 운세 시작하기" 클릭

**User Goal**: 월 ₩3,650 구독하여 매일 AI 운세 받기

**Main Flow**:
1. 사용자가 `/subscription` 페이지 접속
2. 플랜 정보 표시:
   - 월 ₩3,650 (하루 약 ₩120)
   - 매일 자동 생성되는 AI 운세
   - 언제든 해지 가능
3. 사용자가 "365일 운세 시작하기" 클릭
4. TossPayments SDK 결제창 호출:
   ```typescript
   const tossPayments = TossPayments(clientKey);
   await tossPayments.requestBillingAuth({
     customerKey: user_id,
     successUrl: '/api/subscription/success',
     failUrl: '/subscription?error=true'
   });
   ```
5. 사용자가 카드 정보 입력 및 결제 승인
6. TossPayments가 `billing_key` 발급
7. `/api/subscription/success` 콜백 호출
8. Supabase 업데이트:
   ```sql
   UPDATE users 
   SET plan = 'paid',
       billing_key = $billing_key,
       next_billing_date = CURRENT_DATE + INTERVAL '1 month',
       tests_remaining = 365
   WHERE id = $user_id
   ```
9. `payment_logs` 테이블에 기록:
   ```sql
   INSERT INTO payment_logs (user_id, order_id, amount, status, billing_key)
   VALUES ($user_id, $order_id, 3650, 'success', $billing_key)
   ```
10. `/dashboard`로 리다이렉트
11. 축하 토스트: "365일 운세 구독이 시작되었습니다!"

**Edge Cases**:
- 결제 취소 → `/subscription` 복귀 + 에러 메시지
- 카드 한도 초과 → TossPayments 에러 핸들링
- 네트워크 오류 → 재시도 안내
- 이미 구독 중 → "이미 구독 중입니다" 안내

**Expected Outcome**:
- 사용자가 유료 구독자로 전환
- `billing_key` 저장으로 정기결제 준비 완료
- 다음 결제일 자동 설정

**Database Operations**:
- **UPDATE**: `users` (plan='paid', billing_key, next_billing_date)
- **INSERT**: `payment_logs` (결제 내역)

**External Services**:
- **TossPayments SDK**: 결제 및 billing_key 발급

---

## 010. 구독 관리 (해지/재결제)

**Actor**: 유료 구독자

**Trigger**: `/subscription` 페이지에서 "구독 해지하기" 또는 "재결제 시도" 클릭

**User Goal**: 구독 해지하거나 결제 실패 시 재시도

**Main Flow (해지)**:
1. 사용자가 "구독 해지하기" 클릭
2. 확인 모달 표시:
   - "정말 해지하시겠습니까?"
   - "다음 결제일까지 서비스는 유지됩니다"
3. 사용자가 확인
4. TossPayments 해지 API 호출:
   ```typescript
   await toss.cancelBilling(billing_key);
   ```
5. Supabase 업데이트:
   ```sql
   UPDATE users 
   SET plan = 'cancelled',
       billing_key = NULL
   WHERE id = $user_id
   ```
6. 토스트: "구독이 해지되었습니다. [next_billing_date]까지 서비스 이용 가능합니다"
7. `next_billing_date` 도래 시 cron이 `plan='free'`로 자동 전환

**Main Flow (재결제)**:
1. 결제 실패 사용자에게 배너 표시: "결제 실패 - 재시도가 필요합니다"
2. 사용자가 "재결제 시도" 클릭
3. 기존 `billing_key`로 재청구 시도:
   ```typescript
   await toss.requestPayment(billing_key, 3650);
   ```
4. 성공 시:
   - `plan='paid'` 복구
   - `next_billing_date` 갱신
5. 실패 시:
   - "카드 정보를 확인해주세요" 안내
   - 새로운 결제 수단 등록 유도

**Expected Outcome**:
- 사용자가 자유롭게 구독 관리
- 해지 시에도 결제일까지 서비스 유지로 신뢰 확보
- 결제 실패 시 복구 경로 제공

**Database Operations**:
- **UPDATE**: `users` (plan, billing_key)
- **INSERT**: `payment_logs` (해지/재결제 기록)

**External Services**:
- **TossPayments API**: 구독 해지 및 재결제

---

## 011. 매일 자동 리포트 생성 (cron)

**Actor**: 시스템 (Supabase Cron)

**Trigger**: 매일 06:00 KST 자동 실행

**System Goal**: 유료 구독자에게 오늘의 사주 자동 생성

**Main Flow**:
1. Supabase cron이 `/api/cron/daily-report` POST 요청
2. Cron secret 검증
3. 리포트 생성 필요한 사용자 조회:
   ```sql
   SELECT * FROM users 
   WHERE plan = 'paid' 
     AND (last_daily_report_date IS NULL 
          OR last_daily_report_date < CURRENT_DATE)
   ```
4. 각 사용자에 대해:
   - 저장된 생년월일 정보 조회
   - Gemini Pro 모델 호출 (오늘 날짜 기준)
   - `analysis` 테이블에 저장 (type='daily')
   - `last_daily_report_date` 업데이트:
     ```sql
     UPDATE users 
     SET last_daily_report_date = CURRENT_DATE 
     WHERE id = $user_id
     ```
5. 완료 로그 기록

**Expected Outcome**:
- 모든 유료 구독자가 매일 새로운 분석 자동 획득
- 사용자는 로그인만 하면 "오늘의 사주" 확인 가능

**Database Operations**:
- **SELECT**: `users` (리포트 생성 대상)
- **INSERT**: `analysis` (type='daily')
- **UPDATE**: `users.last_daily_report_date`

**External Services**:
- **Gemini API**: `gemini-2.5-pro` 모델

---

## 012. 정기결제 자동화 (cron)

**Actor**: 시스템 (Supabase Cron)

**Trigger**: 매일 00:00 KST 자동 실행

**System Goal**: 결제일이 도래한 구독자에게 자동 청구

**Main Flow**:
1. Supabase cron이 `/api/cron/billing` POST 요청
2. Cron secret 검증
3. 오늘 결제 대상 조회:
   ```sql
   SELECT * FROM users 
   WHERE plan = 'paid' 
     AND next_billing_date = CURRENT_DATE 
     AND billing_key IS NOT NULL
   ```
4. 각 사용자에 대해:
   - TossPayments billing_key로 자동 청구:
     ```typescript
     await toss.requestPayment(billing_key, 3650);
     ```
   - 성공 시:
     - `next_billing_date` +1개월
     - `payment_logs` 기록 (status='success')
   - 실패 시:
     - `plan='suspended'`로 변경
     - `payment_logs` 기록 (status='failed', error_message)
     - 사용자에게 알림 (이메일/앱 내 배너)
5. 결제 통계 로그 기록

**Expected Outcome**:
- 자동 청구로 사용자 편의성 증대
- 결제 실패 시 즉시 탐지 및 복구 유도
- 안정적인 MRR 확보

**Database Operations**:
- **SELECT**: `users` (결제 대상)
- **UPDATE**: `users` (next_billing_date or plan='suspended')
- **INSERT**: `payment_logs` (결제 내역)

**External Services**:
- **TossPayments Billing API**: 자동 청구

---

## Data Flow Summary

```
User Registration:
Clerk → Webhook → Supabase users (plan='free', tests_remaining=3)

Free Trial:
User Input → Gemini Flash → Supabase analysis → tests_remaining -1

Subscription:
User → TossPayments → billing_key → Supabase users (plan='paid')

Daily Report (cron):
Cron → Supabase users (plan='paid') → Gemini Pro → analysis (type='daily')

Billing (cron):
Cron → Supabase users (next_billing_date=today) → TossPayments → payment_logs
```

---

## External Services Integration

| Service | Purpose | Integration Points |
|---------|---------|-------------------|
| **Clerk** | Google OAuth 인증 | Webhook: user.created |
| **Supabase** | 데이터베이스, Cron | API: SELECT/INSERT/UPDATE |
| **TossPayments** | 결제 및 정기결제 | SDK: requestBillingAuth, requestPayment |
| **Gemini API** | AI 사주 분석 | API: generateContent (Flash/Pro) |

