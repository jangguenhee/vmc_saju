Clerk Webhook Integration Guide

Purpose: 이 문서는 Clerk과 Supabase 간의 사용자 데이터 동기화를 위해 Webhook을 생성하고 Next.js App Router 환경에 통합하는 절차를 설명합니다.

⸻

1. Clerk Webhook 개요

Clerk은 사용자의 생성, 수정, 삭제 등의 이벤트를 외부 서버로 전달할 수 있습니다. 이를 활용하면 Next.js 서버에서 Supabase 또는 기타 데이터베이스와 사용자 정보를 자동 동기화할 수 있습니다.

Webhook은 Clerk Dashboard → Configure → Webhooks 메뉴에서 설정할 수 있습니다.

⸻

2. Webhook 생성 단계 (최신 Clerk UI 기준)

① Endpoint URL 입력

아래 주소를 입력하세요.
	•	로컬 개발 시:

https://localhost:3000/api/webhooks/clerk


	•	배포 환경(Vercel 등)에서는 실제 도메인 URL 사용:

https://your-domain.vercel.app/api/webhooks/clerk



⸻

② 이벤트 선택 (Subscribe to events)

검색창에 user.를 입력하고 다음 세 가지 이벤트를 체크합니다:
	•	✅ user.created
	•	✅ user.updated
	•	✅ user.deleted

이 세 가지 이벤트는 Clerk 사용자 변경 사항을 서버로 전달하는 데 필수입니다.

⸻

③ Advanced Configuration 열기

화면 하단의 Advanced Configuration을 클릭하면 Clerk이 자동으로 생성하는 Signing Secret이 표시됩니다.
이 Secret은 Webhook의 서명을 검증하는 데 사용됩니다.

⸻

④ Create 클릭 후 Secret 복사

“Create” 버튼을 누르면 Webhook이 생성되고, 아래와 같은 형태의 Webhook Secret이 표시됩니다:

whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

이 문자열을 복사하세요.

⸻

⑤ 환경 변수 설정 (.env.local)

프로젝트 루트의 .env.local 파일에 아래 줄을 추가합니다:

CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

이 키는 절대 코드에 직접 삽입하거나 Git에 커밋하지 않아야 합니다.

⸻

3. Next.js API 라우트 구현

app/api/webhooks/clerk/route.ts 파일을 생성하고, 다음 코드를 추가하세요:

import { headers } from "next/headers";
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { WebhookEvent } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!SIGNING_SECRET) {
    console.error("Missing CLERK_WEBHOOK_SECRET");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const payload = await req.text();
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  const wh = new Webhook(SIGNING_SECRET);

  try {
    const event = wh.verify(payload, {
      "svix-id": svix_id!,
      "svix-timestamp": svix_timestamp!,
      "svix-signature": svix_signature!,
    }) as WebhookEvent;

    if (event.type === "user.created") {
      console.log("✅ New Clerk user:", event.data.email_addresses[0].email_address);
      // TODO: Supabase 동기화 로직 추가
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ Webhook verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }
}

이 코드는 Clerk에서 전송한 Webhook 요청의 서명을 검증하고, 특정 이벤트(user.created, user.updated, user.deleted) 발생 시 서버 로직을 실행합니다.

⸻

4. Supabase 동기화 예시

Webhook 이벤트를 통해 받은 데이터를 Supabase에 저장하려면 다음과 같이 구현할 수 있습니다:

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

if (event.type === "user.created") {
  const { id, email_addresses } = event.data;
  const email = email_addresses[0].email_address;

  await supabase.from("users").insert({
    clerk_id: id,
    email,
    tier: "free",
    test_count: 3,
  });
}


⸻

5. 테스트 방법
	1.	Clerk Dashboard에서 새 유저를 생성하거나 회원가입 테스트를 진행합니다.
	2.	Next.js 서버 콘솔에서 다음 로그를 확인하세요:

✅ New Clerk user: example@example.com


	3.	Supabase users 테이블에서 새 레코드가 추가되었는지 확인합니다.

⸻

6. 문제 해결 가이드

문제	원인	해결 방법
400 Invalid signature	Webhook Secret이 일치하지 않음	Clerk Dashboard의 Secret을 다시 복사하여 .env.local 갱신
500 Server misconfigured	환경변수 누락	CLERK_WEBHOOK_SECRET 설정 여부 확인
이벤트 로그 없음	이벤트 미구독	user.created, user.updated, user.deleted 체크 여부 확인


⸻

7. 참고 문서
	•	Clerk Webhook 공식 문서: https://clerk.com/docs/webhooks
	•	Svix (Clerk Webhook 검증 라이브러리): https://docs.svix.com
	•	Supabase JavaScript SDK: https://supabase.com/docs/reference/javascript