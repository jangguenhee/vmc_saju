# Product Requirements Document (PRD)
## 365일 사주 - AI 운세 구독 SaaS

**Version**: 1.0.0  
**Date**: 2025-10-27  
**Author**: moguni  
**Status**: Draft → Ready for Development

---

## Executive Summary

**365일 사주**는 Google Gemini AI 기반의 사주팔자 분석을 구독형 SaaS로 제공하는 서비스입니다. 사용자는 무료 체험(3회)을 통해 AI 운세의 품질을 경험하고, 월 ₩3,650 구독으로 매일 개인 맞춤 운세 리포트를 받습니다.

### Key Metrics
- **Target**: 월 1,000명 가입자 (6개월 내)
- **Conversion Rate**: 무료 → 유료 20% 목표
- **Retention**: 3개월 구독 유지율 70%
- **MRR Target**: ₩3,650,000 (1,000명 × ₩3,650)

---

## 1. Problem Statement

### 현재 시장 상황
1. **기존 운세 서비스의 문제점**
   - 일회성 결제로 지속성 부족
   - 사람의 운세풀이는 비용이 높고(평균 3-5만원) 접근성 낮음
   - 모바일 앱은 광고 기반으로 사용자 경험 저하
   - 일반적인 운세는 개인화 부족

2. **사용자 니즈**
   - 매일 확인할 수 있는 저렴한 운세
   - AI 기반의 객관적이고 정밀한 분석
   - 언제 어디서나 접근 가능한 웹 기반
   - 구독 형태로 부담 없는 가격

### Solution
AI 기반 사주 분석을 **하루 ₩120 수준(월 ₩3,650)**의 구독 서비스로 제공하여, 매일 개인 맞춤 운세를 받는 'AI 운세 코치' 경험 제공.

---

## 2. Target Users

### Primary Persona: "운세 관심러"
- **연령**: 25-45세
- **성별**: 여성 60% / 남성 40%
- **특징**:
  - 사주/운세에 관심은 있지만 전문가 상담은 부담스러움
  - 아침 루틴으로 운세 체크하는 습관
  - 구독 서비스(넷플릭스, 멜론 등) 이용 경험 多
  - 모바일/웹 친화적
  
- **Pain Points**:
  - 기존 운세 앱은 광고가 너무 많음
  - 오프라인 사주 상담은 비싸고 시간 소요
  - 매일 볼 수 있는 신뢰할 만한 서비스 부재

### Secondary Persona: "의사결정 보조자"
- **연령**: 30-55세
- **특징**:
  - 중요한 결정(이직, 투자, 결혼 등) 전 운세 참고
  - 데이터 기반 분석에 신뢰도 높음
  - 일회성보다 지속적인 모니터링 선호

---

## 3. Product Goals

### Business Goals
1. **Launch (Month 1-3)**
   - 100명 유료 전환
   - MRR ₩365,000 달성
   - 무료 체험 완료율 80%

2. **Growth (Month 4-6)**
   - 1,000명 가입자 확보
   - 무료→유료 전환율 20% 달성
   - 3개월 Retention 70%

3. **Scale (Month 7-12)**
   - 5,000명 가입자
   - 프리미엄 티어 추가 (₩5,900/월)
   - 파트너십 (웨딩, 취업 플랫폼)

### User Goals
1. **Discovery**: 5분 내 서비스 가치 이해
2. **Activation**: 첫 AI 분석까지 3분 이내
3. **Habit**: 매일 아침 운세 체크 루틴화
4. **Retention**: 구독 지속률 70% (3개월 기준)

---

## 4. Features & Requirements

### 4.1 MVP Features (Launch)

#### ✅ P0 (Critical - Must Have)

| Feature | Description | Success Criteria |
|---------|-------------|------------------|
| **Google OAuth** | Clerk 기반 간편 로그인 | 로그인 완료율 95% |
| **무료 체험** | 3회 AI 분석 제공 | 3회 모두 사용률 80% |
| **AI 분석 (Basic)** | Gemini Flash 모델 사용 | 응답 속도 <5초 |
| **구독 결제** | TossPayments 월 ₩3,650 | 결제 성공률 95% |
| **오늘의 사주** | 매일 자동 생성 리포트 | 생성 성공률 99% |
| **대시보드** | 분석 히스토리 및 상태 확인 | 페이지 로드 <2초 |

#### 🔵 P1 (Important - Should Have)

| Feature | Description | Target |
|---------|-------------|--------|
| **공유 기능** | 분석 결과 SNS 공유 | 공유율 10% |
| **구독 관리** | 해지/재결제/이력 | Self-service 90% |
| **정기결제 자동화** | Webhook + Cron 백업 | 자동화율 100% |
| **모바일 반응형** | 모든 디바이스 지원 | 모바일 UX 만족도 4.0+ |

#### 🟢 P2 (Nice to Have - Could Have)

| Feature | Description | Timeline |
|---------|-------------|----------|
| **이메일 알림** | 결제 실패/성공 알림 | Post-MVP |
| **분석 결과 PDF** | 다운로드 기능 | V1.1 |
| **음력 달력 지원** | 음력 생일 입력 | V1.1 |
| **Kakao 로그인** | 추가 로그인 옵션 | V1.2 |

---

### 4.2 User Stories

#### Epic 1: Authentication & Onboarding

**US-001: Google 로그인**
```
As a 신규 사용자
I want to Google 계정으로 빠르게 로그인하고 싶다
So that 별도 회원가입 절차 없이 바로 서비스를 이용할 수 있다

Acceptance Criteria:
- [ ] "무료로 시작하기" 버튼 클릭 시 Clerk Google OAuth 팝업
- [ ] 로그인 완료 후 /dashboard로 자동 리다이렉트
- [ ] Supabase users 테이블에 자동 등록 (tests_remaining=3)
- [ ] 로그인 상태는 새로고침 후에도 유지
```

**US-002: 무료 체험 안내**
```
As a 신규 가입자
I want to 무료 체험 횟수를 명확히 알고 싶다
So that 어떻게 서비스를 테스트할지 이해할 수 있다

Acceptance Criteria:
- [ ] 대시보드 상단에 "무료 체험 중 (남은 X회)" 배너 표시
- [ ] 체험 완료 시 "365일 운세 시작하기" CTA 강조
```

#### Epic 2: AI Analysis

**US-003: 사주 분석 요청**
```
As a 사용자
I want to 내 생년월일을 입력하여 AI 사주 분석을 받고 싶다
So that 오늘의 운세를 확인할 수 있다

Acceptance Criteria:
- [ ] 필수 입력: 이름, 생년월일, 성별
- [ ] 선택 입력: 출생시간 (모름 옵션 포함)
- [ ] 입력 validation (날짜 형식, 미래 날짜 방지)
- [ ] "AI 사주 분석 시작하기" 버튼으로 제출
- [ ] 무료 사용자는 tests_remaining 확인 후 진행
```

**US-004: AI 분석 진행 상태**
```
As a 사용자
I want to AI가 분석하는 과정을 시각적으로 보고 싶다
So that 기다리는 동안 서비스 신뢰도를 느낄 수 있다

Acceptance Criteria:
- [ ] 로딩 중 "천간과 지지를 해석하는 중..." 등 단계별 메시지
- [ ] Progress bar 0%→100% 애니메이션
- [ ] 평균 분석 시간 <5초
- [ ] 타임아웃 시 재시도 옵션 제공
```

**US-005: 분석 결과 열람**
```
As a 사용자
I want to AI가 생성한 사주 분석 결과를 보기 좋게 읽고 싶다
So that 오늘의 운세와 조언을 이해할 수 있다

Acceptance Criteria:
- [ ] Markdown 렌더링 (헤딩, 리스트, 강조)
- [ ] 섹션: 기본 구조, 오행 분석, 오늘의 운세, 행운 포인트, 조언
- [ ] 무료 사용자는 일부 섹션 잠금 (대운/세운 비활성화)
- [ ] "다시 분석하기", "공유하기" 버튼
```

#### Epic 3: Subscription

**US-006: 구독 시작**
```
As a 무료 체험 완료 사용자
I want to 월 ₩3,650으로 구독하고 싶다
So that 매일 AI 운세를 받을 수 있다

Acceptance Criteria:
- [ ] TossPayments 결제창 호출
- [ ] 결제 성공 시 plan='paid', tests_remaining=365
- [ ] billing_key 저장 및 next_billing_date 설정 (+1개월)
- [ ] 결제 완료 후 /dashboard로 리다이렉트
- [ ] "365일 운세 구독 중" 배너 표시
```

**US-007: 구독 해지**
```
As a 유료 구독자
I want to 언제든지 구독을 해지하고 싶다
So that 더 이상 필요하지 않을 때 결제를 중단할 수 있다

Acceptance Criteria:
- [ ] /subscription 페이지에 "구독 해지하기" 버튼
- [ ] 해지 확인 모달 (다음 결제일까지 유지 안내)
- [ ] billing_key 삭제, plan='cancelled'
- [ ] 만료일까지 서비스 유지 후 자동 'free' 전환
```

**US-008: 정기결제 자동화**
```
As a 시스템
I want to 매달 자동으로 구독료를 청구하고 싶다
So that 사용자가 수동 결제 없이 서비스를 지속 이용할 수 있다

Acceptance Criteria:
- [ ] Supabase cron이 매일 00:00 KST 실행
- [ ] next_billing_date = today인 사용자 조회
- [ ] TossPayments billing_key로 자동 청구
- [ ] 성공 시 next_billing_date +1개월
- [ ] 실패 시 plan='suspended', 사용자 알림
```

#### Epic 4: Daily Reports (Pro Users)

**US-009: 매일 자동 생성**
```
As a 유료 구독자
I want to 매일 아침 오늘의 운세가 자동으로 생성되길 원한다
So that 매번 요청하지 않아도 최신 리포트를 확인할 수 있다

Acceptance Criteria:
- [ ] Supabase cron이 매일 06:00 KST 실행
- [ ] plan='paid' && last_daily_report_date < today 사용자 조회
- [ ] Gemini Pro 모델로 분석 생성
- [ ] analysis 테이블에 type='daily'로 저장
- [ ] last_daily_report_date 업데이트
```

**US-010: 오늘의 사주 위젯**
```
As a 유료 구독자
I want to 대시보드에서 오늘의 운세를 바로 보고 싶다
So that 별도 페이지 이동 없이 핵심 내용을 확인할 수 있다

Acceptance Criteria:
- [ ] 대시보드 최상단에 "오늘의 사주" 카드 표시
- [ ] 요약: 오늘의 키워드, 행운 포인트, 종합 운세 (★★★★☆)
- [ ] "상세 보기" 클릭 시 /analysis/[id]로 이동
```

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| **페이지 로드** | <2초 (LCP) | Lighthouse |
| **AI 응답 속도** | <5초 (Flash), <10초 (Pro) | API monitoring |
| **결제 처리** | <3초 | TossPayments 대시보드 |
| **Webhook 처리** | <1초 | Vercel logs |
| **Cron 실행** | 100% 성공률 | Supabase logs |

### 5.2 Scalability

- **동시 접속**: 1,000 CCU 처리 가능
- **DB 쿼리**: 평균 <100ms
- **Gemini API**: Rate limit 고려 (60 req/min)
- **Vercel Functions**: 10초 timeout 설정

### 5.3 Security

- **인증**: Clerk SDK (Google OAuth 2.0)
- **데이터베이스**: Supabase RLS 활성화
- **API 키**: 환경 변수로만 관리 (.env.local)
- **Webhook 검증**: 서명 검증 필수 (Clerk, TossPayments)
- **결제 정보**: TossPayments에 위임 (카드 정보 미저장)

### 5.4 Availability

- **Uptime**: 99.5% (Vercel SLA)
- **Backup**: Supabase 자동 백업 (24시간 주기)
- **Monitoring**: Vercel Analytics + Supabase Logs
- **Error Tracking**: Sentry 연동 (선택)

### 5.5 Compliance

- **개인정보 보호**: 최소한의 정보만 수집 (이름, 생년월일, 이메일)
- **데이터 보관**: 회원 탈퇴 시 30일 후 완전 삭제
- **약관**: 서비스 이용약관, 개인정보 처리방침 (법무팀 검토 필요)

---

## 6. Success Metrics (KPIs)

### 6.1 Acquisition Metrics

| Metric | Definition | Target (Month 3) |
|--------|------------|------------------|
| **신규 가입자** | 주간 신규 Clerk 가입 수 | 100명/주 |
| **가입 완료율** | 로그인 시도 / 로그인 완료 | 95% |
| **첫 분석 완료율** | 가입 / 첫 분석 요청 | 80% |

### 6.2 Activation Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **무료 체험 완료율** | 3회 모두 사용 / 가입자 | 70% |
| **체험 → 구독 전환** | 유료 전환 / 무료 완료 | 20% |
| **첫 결제 성공률** | 결제 성공 / 결제 시도 | 95% |

### 6.3 Retention Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **D7 Retention** | 7일 후 재방문율 | 40% |
| **D30 Retention** | 30일 후 구독 유지율 | 80% |
| **D90 Retention** | 90일 후 구독 유지율 | 70% |
| **Churn Rate** | 월간 해지율 | <10% |

### 6.4 Revenue Metrics

| Metric | Definition | Target (Month 6) |
|--------|------------|------------------|
| **MRR** | Monthly Recurring Revenue | ₩3,650,000 |
| **ARPU** | Average Revenue Per User | ₩3,650 |
| **LTV** | Lifetime Value (12개월 기준) | ₩43,800 |
| **CAC** | Customer Acquisition Cost | <₩10,000 |

### 6.5 Product Quality Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **AI 응답 속도** | 평균 분석 생성 시간 | <5초 |
| **결제 성공률** | 결제 성공 / 결제 시도 | >95% |
| **Webhook 성공률** | Webhook 처리 성공 | >99% |
| **Cron 실행률** | Cron job 성공률 | 100% |

---

## 7. Out of Scope (V1.0)

다음 기능들은 MVP에서 제외하고 추후 버전에서 구현:

- ❌ 카카오/네이버 로그인
- ❌ 이메일 알림 시스템
- ❌ 분석 결과 PDF 다운로드
- ❌ 음력 달력 지원
- ❌ 궁합/사주 비교 기능
- ❌ 프리미엄 티어 (₩5,900/월)
- ❌ 추천/리워드 프로그램
- ❌ 모바일 앱 (React Native)
- ❌ 챗봇 상담
- ❌ 커뮤니티 기능

---

## 8. Risks & Mitigation

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Gemini API 장애** | 서비스 불가 | Retry 로직 + fallback 메시지 |
| **TossPayments 결제 실패** | 매출 손실 | 자동 재시도 + 이메일 알림 |
| **Webhook 누락** | 데이터 불일치 | Supabase cron 백업 시스템 |
| **낮은 무료→유료 전환율** | 매출 미달 | A/B 테스트로 CTA 최적화 |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| **AI 분석 품질 불만** | Churn 증가 | 사용자 피드백 수집 + 프롬프트 개선 |
| **서버 과부하** | 응답 속도 저하 | Vercel auto-scaling + caching |
| **법적 이슈 (점술 관련)** | 서비스 중단 | "오락 목적" 명시 + 법무 검토 |

---

## 9. Launch Plan

### Phase 1: Soft Launch (Week 1-2)
- ✅ 기술 스택 검증
- ✅ 50명 베타 테스터 모집
- ✅ 무료 체험 흐름 테스트
- ✅ 피드백 수집 및 개선

### Phase 2: Public Launch (Week 3-4)
- 🚀 공식 런칭 (Product Hunt, 페이스북 그룹)
- 📈 마케팅: SEO, 인스타그램 광고
- 📊 Analytics 모니터링
- 🎯 KPI 달성 여부 추적

### Phase 3: Growth (Month 2-3)
- 🔥 Referral 프로그램 도입
- 💡 기능 개선 (사용자 요청 기반)
- 📧 이메일 마케팅 시작
- 🤝 파트너십 탐색 (웨딩, 취업 플랫폼)

---

## 10. Dependencies

### External Services
- ✅ Clerk (인증)
- ✅ Supabase (DB + Cron)
- ✅ TossPayments (결제)
- ✅ Gemini API (AI)
- ✅ Vercel (배포)

### Team Requirements
- **개발**: 1명 (Full-stack)
- **디자인**: 외주 가능 (랜딩 페이지만)
- **PM**: 겸직 가능
- **마케팅**: 런칭 후 고려

### Timeline
- **설계 & 문서화**: 1주
- **개발**: 4주
- **테스트**: 1주
- **Soft Launch**: 1주
- **Total**: 7주 → 런칭

---

## 11. Appendix

### A. Competitive Analysis

| 서비스 | 가격 | 장점 | 단점 |
|--------|------|------|------|
| **토정비결 앱** | 무료 (광고) | 무료, 한국 전통 | 광고 과다, 일회성 |
| **사주카페** | ₩30,000/회 | 전문가 상담 | 고가, 1회성 |
| **만세력 앱** | ₩5,000/월 | 상세 정보 | UI 복잡, AI 없음 |
| **365일 사주** | ₩3,650/월 | AI 기반, 매일 리포트 | 신규 서비스 |

### B. Marketing Strategy (Brief)

- **SEO**: "AI 사주", "온라인 운세", "사주 구독" 키워드 최적화
- **SNS**: 인스타그램 광고 (타겟: 25-45세 여성)
- **Product Hunt**: 런칭 부스트
- **입소문**: 공유 기능으로 바이럴 유도

---

## Approval

| Role | Name | Status | Date |
|------|------|--------|------|
| **Product Manager** | moguni | ✅ Approved | 2025-10-27 |
| **Tech Lead** | - | ⏳ Pending | - |
| **Stakeholder** | - | ⏳ Pending | - |

---

**Next Steps**:
1. ✅ PRD 승인
2. ⏳ Technical Spec 작성
3. ⏳ API Documentation 작성
4. ⏳ 개발 시작