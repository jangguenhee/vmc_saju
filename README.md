# 🌞 365일 사주 (vmc-saju)

AI 기반 개인 맞춤형 사주 분석 SaaS 서비스  
Gemini AI가 당신의 하루를 분석하고 조언합니다.

---

## 🚀 프로젝트 개요

- **서비스 형태:** 구독형 SaaS (월 ₩3,650)
- **핵심 기능:**  
  1. Google 로그인 (Clerk SDK)  
  2. 무료 체험 3회  
  3. TossPayments 정기결제  
  4. Gemini AI 사주 리포트 생성  
  5. Supabase Cron 기반 결제 자동화  

---

## 🧩 기술 스택

| 영역 | 사용 기술 |
|------|------------|
| 인증 | Clerk SDK |
| DB & Cron | Supabase |
| 결제 | TossPayments (REST API + Webhook) |
| AI 분석 | Google Gemini 2.5 (Flash / Pro) |
| 배포 | Vercel (Next.js 15, Tailwind CSS) |

---

## ⚙️ 설치 및 실행

```bash
# 1️⃣ Next.js 프로젝트 생성 (이미 완료된 경우 생략)
npx create-next-app@latest vcm-saju --typescript --tailwind --app

# 2️⃣ 패키지 설치
npm install @clerk/nextjs @supabase/supabase-js @google/generative-ai @tosspayments/payment-widget-sdk axios

# 3️⃣ 개발 서버 실행
npm run dev


⸻

🔐 환경 변수 설정 (.env.local)

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_public_key
CLERK_SECRET_KEY=your_clerk_secret_key

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key

TOSS_SECRET_KEY=your_toss_secret_key
TOSS_CLIENT_KEY=your_toss_client_key

GEMINI_API_KEY=your_gemini_api_key


⸻

📁 주요 디렉토리 구조

/docs
 ├─ requirement.md       # 요구사항 명세서
 ├─ spec.md              # 상세 기술 스펙
 └─ prompt/
     └─ external.md      # API 연동 가이드

/src
 ├─ app/
 │   ├─ dashboard/       # 메인 대시보드
 │   ├─ analysis/        # 분석 상세보기
 │   ├─ subscription/    # 구독 관리
 │   └─ api/             # Webhook & 결제 처리
 └─ lib/
     ├─ toss.ts          # TossPayments REST API 헬퍼
     ├─ gemini.ts        # Gemini AI 호출 로직
     └─ supabase.ts      # Supabase 클라이언트


⸻

🧪 테스트 시나리오
	1.	신규 가입 후 무료 분석 3회 가능 여부 확인
	2.	4번째 요청 시 구독 안내 노출
	3.	Toss 결제 성공 시 365일 플랜 활성화
	4.	해지 후 다음 결제일까지 서비스 유지
	5.	Supabase Cron 정기결제 자동 실행 확인

⸻

## 📄 라이선스

© 2025 Moguni. All Rights Reserved.  

