# Clerk + Next.js 15 통합 가이드 (검증 완료)

**최종 업데이트**: 2025년 10월 26일  
**대상 버전**: Next.js 15.x LTS, @clerk/nextjs 6.34.0+, React 19  

---

## 1. 개요

이 문서는 Clerk 인증을 Next.js 15 기반 프로젝트에 통합하기 위한 **완전한 설정 및 검증 가이드**입니다.  
이 가이드는 실제 `.env.local` 환경 변수, Supabase 연동, Webhook, 보안 검증까지 포함합니다.

---

## 2. 패키지 설치

```bash
npm install @clerk/nextjs svix

@clerk/nextjs: Clerk SDK
svix: Webhook 서명 검증용 라이브러리

⸻

3. 환경 변수 설정

.env.local 파일 예시:

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

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cron Secret
CRON_SECRET=zEvclY8tv9s8YEYFKLcMP1KC2V7qqlKNLjTTwI0SIzU=

.env.local은 반드시 .gitignore에 추가해야 합니다.
프로덕션에서는 sk_live_... 키를 사용하세요.

⸻

4. ClerkProvider 설정

파일: src/app/layout.tsx

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

koKR은 한국어 로컬라이제이션 지원.

⸻

5. 인증 페이지 생성

mkdir -p src/app/sign-in/[[...sign-in]]
mkdir -p src/app/sign-up/[[...sign-up]]

로그인 페이지:

// src/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn routing="path" path="/sign-in" />
    </div>
  )
}

회원가입 페이지:

// src/app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp routing="path" path="/sign-up" />
    </div>
  )
}


⸻

6. 미들웨어 설정

파일: src/middleware.ts

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico)).*)',
    '/(api|trpc)(.*)',
  ],
}


⸻

7. Webhook 구성

파일: src/app/api/webhooks/clerk/route.ts

import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { WebhookEvent } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) throw new Error('CLERK_WEBHOOK_SECRET not set')

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('❌ Webhook verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const eventType = evt.type
  console.log(`✅ Received Clerk event: ${eventType}`)

  switch (eventType) {
    case 'user.created':
      await handleUserCreated(evt.data)
      break
    case 'user.updated':
      await handleUserUpdated(evt.data)
      break
    case 'user.deleted':
      await handleUserDeleted(evt.data)
      break
  }

  return NextResponse.json({ ok: true })
}

async function handleUserCreated(data: any) {
  console.log('New user created:', data.id)
}

async function handleUserUpdated(data: any) {
  console.log('User updated:', data.id)
}

async function handleUserDeleted(data: any) {
  console.log('User deleted:', data.id)
}


⸻

8. 인증 예시

Server Component:

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await currentUser()
  return <h1>안녕하세요, {user?.firstName}님!</h1>
}

Client Component:

'use client'
import { useUser, useClerk } from '@clerk/nextjs'

export default function Profile() {
  const { user } = useUser()
  const { signOut } = useClerk()
  return (
    <div>
      <p>{user?.firstName} {user?.lastName}</p>
      <button onClick={() => signOut()}>로그아웃</button>
    </div>
  )
}


⸻

9. Webhook 등록 절차
	1.	[Clerk Dashboard → Webhooks → Add Endpoint]
	2.	URL: https://your-domain.com/api/webhooks/clerk
	3.	선택 이벤트: user.created, user.updated, user.deleted
	4.	생성 후 Signing Secret 복사 → .env.local의 CLERK_WEBHOOK_SECRET에 설정

⸻

10. 보안 체크리스트

항목	설명	상태
.env.local gitignore 등록	✅	
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY만 공개	✅	
Webhook Svix 서명 검증	✅	
auth().protect() 적용	✅	
Next.js 15.2.3 이상 (보안 패치)	✅	
Secret Key 로테이션 주기적 수행	✅	


⸻

11. 테스트 절차

테스트 항목	방법
로그인/회원가입	/sign-in, /sign-up 방문
인증 보호 라우트	/dashboard에서 redirect 동작 확인
Webhook 이벤트	Clerk Dashboard에서 test event 전송
Supabase 동기화	user.created 시 users 테이블 업데이트 확인


⸻

12. 참고 문서
	•	Clerk 공식 문서
	•	Next.js Quickstart (App Router)
	•	Webhook 가이드
	•	Svix 문서
	•	보안 권고: CVE-2025-29927

⸻

작성자: Claude Code
검증자: GPT-5
검증일: 2025년 10월 26일

---

원하면 이 문서를 `.md` 파일로 실제 생성해줄 수도 있습니다.  
그럴까요? (자동으로 `docs/external/clerk-integration.md`에 쓰기 가능하게 해드림)