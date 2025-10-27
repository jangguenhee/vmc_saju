# Clerk + Next.js 15 통합 가이드 (검증 완료)

**최종 업데이트**: 2025년 10월 26일  
**대상 버전**: Next.js 15.x LTS, @clerk/nextjs 6.34.0+, React 19  

---

## 1. 개요
Clerk 인증을 Next.js 15 기반 프로젝트에 통합하기 위한 최신 공식 가이드입니다.  
Supabase, TossPayments, Gemini AI와 함께 사용하는 완전한 구성 예시를 포함합니다.

---

## 2. 패키지 설치

```bash
npm install @clerk/nextjs svix


⸻

3. 환경 변수 설정

.env.local 파일에 다음을 추가하세요:

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://airejmwpwivwryfutlma.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# TossPayments
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...
TOSS_SECRET_KEY=test_sk_...
TOSS_WEBHOOK_SECRET=...

# Gemini AI
GEMINI_API_KEY=AIza...

# Cron Secret
CRON_SECRET=zEvclY8tv9s8YEYFKLcMP1KC2V7qqlKNLjTTwI0SIzU=


⸻

4. ClerkProvider 설정

src/app/layout.tsx:

import { ClerkProvider } from '@clerk/nextjs'
import { koKR } from '@clerk/localizations'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={koKR}>
      <html lang="ko">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}


⸻

5. 미들웨어 설정

src/middleware.ts:

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico)).*)',
    '/(api|trpc)(.*)',
  ],
}


⸻

6. Webhook 구현

src/app/api/webhooks/clerk/route.ts:

import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { WebhookEvent } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!
  const header = await headers()
  const payload = await req.json()
  const wh = new Webhook(WEBHOOK_SECRET)
  const evt = wh.verify(JSON.stringify(payload), {
    'svix-id': header.get('svix-id')!,
    'svix-timestamp': header.get('svix-timestamp')!,
    'svix-signature': header.get('svix-signature')!,
  }) as WebhookEvent

  switch (evt.type) {
    case 'user.created':
      console.log('🆕 New user:', evt.data.id)
      break
    case 'user.updated':
      console.log('✏️ Updated user:', evt.data.id)
      break
    case 'user.deleted':
      console.log('🗑️ Deleted user:', evt.data.id)
      break
  }

  return NextResponse.json({ ok: true })
}


⸻

7. 테스트 & 배포 체크리스트

항목	설명
✅ .env.local gitignore 등록	민감정보 보호
✅ Clerk 키 설정 완료	Publishable + Secret
✅ Webhook 등록	/api/webhooks/clerk
✅ Supabase 연동 확인	Database + Cron
✅ TossPayments API 테스트	구독 결제
✅ Gemini API 응답 확인	분석 기능


⸻

8. 참고 문서
	•	Clerk Docs
	•	Next.js Quickstart
	•	Svix Docs
	•	보안 권고: CVE-2025-29927

⸻

작성자: Claude Code
검증자: GPT-5
검증일: 2025-10-26
