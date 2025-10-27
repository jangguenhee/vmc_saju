
# TossPayments Webhook Integration Guide

**최종 업데이트:** 2025년 10월 27일  
**대상 버전:** TossPayments v2 API, Next.js 15 App Router, Supabase 연동

---

## 1. 개요

이 문서는 TossPayments의 Webhook 기능을 Next.js 기반 서버에 안전하게 연결하고,  
결제 상태(`DONE`, `CANCELED`, `FAILED`)에 따라 Supabase 데이터베이스를 자동으로 갱신하는 방법을 설명합니다.

---

## 2. 사전 준비

1. [TossPayments 콘솔](https://console.tosspayments.com) 로그인  
2. **설정 → API Keys** 메뉴 이동  
3. 다음 값을 `.env.local` 파일에 저장합니다:

```bash
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_XXXXXXXXXXXX
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXX
TOSS_WEBHOOK_SECRET=whsec_XXXXXXXXXXXX

💡 운영 환경에서는 반드시 Live 키를 별도로 발급받고, .gitignore에 .env.local을 포함하세요.

⸻

3. Webhook 엔드포인트 설정

TossPayments는 결제 상태 변경 시 Webhook 이벤트를 전송합니다.
서버에서 이를 수신하기 위한 라우트를 생성합니다.

경로: app/api/webhooks/toss/route.ts

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("TossPayments-Signature");

    // 1️⃣ 서명 검증
    const expectedSignature = crypto
      .createHmac("sha512", process.env.TOSS_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid TossPayments Webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2️⃣ 이벤트 파싱
    const event = JSON.parse(rawBody);
    const { eventType, data } = event;

    // 3️⃣ 이벤트 타입별 처리
    if (eventType === "PAYMENT_STATUS_CHANGED") {
      const { orderId, status, customerKey, billingKey, amount } = data;

      await supabase.from("payment_logs").insert({
        order_id: orderId,
        user_id: customerKey,
        status,
        amount: amount.total,
        billing_key: billingKey,
      });

      // 4️⃣ 결제 완료 시 유저 플랜 업데이트
      if (status === "DONE") {
        await supabase
          .from("users")
          .update({
            plan: "pro",
            next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })
          .eq("id", customerKey);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("⚠️ Webhook handling failed:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}


⸻

4. Toss Webhook 이벤트 목록

이벤트	설명
PAYMENT_STATUS_CHANGED	결제 완료 / 실패 / 취소 상태 전송
BILLING_KEY_ISSUED	정기 결제용 빌링키 발급
BILLING_KEY_DELETED	정기 결제 해지


⸻

5. 보안 서명 검증

TossPayments는 Webhook 요청마다 TossPayments-Signature 헤더를 포함합니다.
이 헤더는 TOSS_WEBHOOK_SECRET 기반 HMAC-SHA512 서명으로 검증해야 합니다.

검증 공식:

crypto
  .createHmac("sha512", process.env.TOSS_WEBHOOK_SECRET!)
  .update(rawBody)
  .digest("hex");


⸻

6. Supabase 테이블 연동 예시

테이블	역할	주요 컬럼
users	유저 플랜 관리	id, plan, next_billing_date, billing_key
payment_logs	결제 내역 기록	order_id, status, amount, billing_key
subscriptions	정기 결제 관리	user_id, renewal_date, status


⸻

7. 테스트 절차
	1.	TossPayments 콘솔 → “Webhook 테스트” 선택
	2.	URL 입력

https://yourdomain.com/api/webhooks/toss


	3.	샘플 이벤트(PAYMENT_STATUS_CHANGED) 전송
	4.	서버 로그 확인 → “✅ Webhook received” 출력 확인
	5.	Supabase payment_logs 테이블에 데이터가 기록되는지 확인

⸻

8. 에러 및 보안 가이드라인

유형	원인	해결
401 Unauthorized	잘못된 시그니처	.env.local의 TOSS_WEBHOOK_SECRET 확인
500 Internal Error	DB 삽입 오류	SERVICE_ROLE_KEY 권한 확인
중복 이벤트 처리	Toss 재시도	order_id 중복 검사 또는 idempotency 키 사용


⸻

9. 요약
	•	/api/webhooks/toss 라우트 생성
	•	TOSS_WEBHOOK_SECRET으로 HMAC 검증
	•	PAYMENT_STATUS_CHANGED 이벤트 처리
	•	Supabase users / payment_logs 자동 갱신
	•	Toss 콘솔에서 Webhook 테스트로 검증 가능

좋아요 🔥
아래는 TossPayments + Next.js (App Router) 환경에서 사용할 완전한 클라이언트 & 서버 통합 가이드입니다.
👉 실제 프로젝트 구조(app/, lib/, api/) 기준으로 작동하도록 설계했습니다.

⸻

🧭 TossPayments + Next.js 통합 가이드 (Full Stack)

최종 업데이트: 2025년 10월
대상 버전: Next.js 15, TossPayments v2 API, Supabase 연동

⸻

1️⃣ 환경 변수 설정 (.env.local)

NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_XXXXXXXXXXXX
TOSS_SECRET_KEY=test_sk_XXXXXXXXXXXX
TOSS_WEBHOOK_SECRET=whsec_XXXXXXXXXXXX

NEXT_PUBLIC_SUPABASE_URL=https://airejmwpwivwryfutlma.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key


⸻

2️⃣ 클라이언트 측 (결제 버튼 & 위젯 렌더링)

경로: app/(billing)/subscribe/page.tsx

"use client";

import { useEffect, useState } from "react";
import { loadPaymentWidget } from "@tosspayments/payment-widget-sdk";
import { nanoid } from "nanoid";

export default function SubscribePage() {
  const [paymentWidget, setPaymentWidget] = useState<any>(null);
  const [paymentMethodWidget, setPaymentMethodWidget] = useState<any>(null);
  const [amount, setAmount] = useState(5000);
  const [orderId] = useState(() => `order_${nanoid()}`);

  useEffect(() => {
    (async () => {
      const widget = await loadPaymentWidget(
        process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!,
        "customer_1234" // 실제 Clerk userId 혹은 Supabase user_id로 대체
      );
      setPaymentWidget(widget);

      const methodWidget = widget.renderPaymentMethods("#payment-widget", amount);
      setPaymentMethodWidget(methodWidget);
    })();
  }, [amount]);

  const handlePay = async () => {
    if (!paymentWidget) return;

    try {
      const result = await paymentWidget.requestPayment({
        orderId,
        orderName: "사주 분석 Pro 구독",
        successUrl: `${window.location.origin}/api/payments/success`,
        failUrl: `${window.location.origin}/api/payments/fail`,
        customerEmail: "user@example.com",
      });
      console.log("✅ Payment initiated:", result);
    } catch (err) {
      console.error("❌ Payment failed:", err);
    }
  };

  return (
    <main className="p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-3">Pro 구독 (₩{amount})</h2>
      <div id="payment-widget" className="border rounded-md p-4 mb-4"></div>
      <button
        onClick={handlePay}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md"
      >
        결제하기
      </button>
    </main>
  );
}


⸻

3️⃣ 결제 성공 처리 (서버 API)

경로: app/api/payments/success/route.ts

import { NextResponse } from "next/server";
import { approvePayment } from "@/lib/tosspayments/api";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const paymentKey = searchParams.get("paymentKey");
  const orderId = searchParams.get("orderId");
  const amount = Number(searchParams.get("amount"));

  if (!paymentKey || !orderId || !amount)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    // 1️⃣ TossPayments 결제 승인
    const payment = await approvePayment(paymentKey, orderId, amount);

    // 2️⃣ Supabase에 결제 내역 저장
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabase.from("payment_logs").insert({
      order_id: orderId,
      payment_key: paymentKey,
      status: payment.status,
      amount: payment.totalAmount,
      user_id: payment.customerKey,
    });

    // 3️⃣ Pro 플랜 활성화
    await supabase
      .from("users")
      .update({ plan: "pro" })
      .eq("id", payment.customerKey);

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/success`);
  } catch (error) {
    console.error("Payment success handler error:", error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/fail`);
  }
}


⸻

4️⃣ 서버 공통 TossPayments API 유틸

경로: lib/tosspayments/api.ts

import fetch from "node-fetch";

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY!;
const API_BASE = "https://api.tosspayments.com/v1";

function authHeader() {
  const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64");
  return `Basic ${encoded}`;
}

// ✅ 결제 승인
export async function approvePayment(paymentKey: string, orderId: string, amount: number) {
  const res = await fetch(`${API_BASE}/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// ✅ 결제 조회
export async function retrievePayment(orderId: string) {
  const res = await fetch(`${API_BASE}/payments/orders/${orderId}`, {
    headers: { Authorization: authHeader() },
  });
  return res.json();
}

// ✅ 결제 취소
export async function cancelPayment(paymentKey: string, reason: string) {
  const res = await fetch(`${API_BASE}/payments/${paymentKey}/cancel`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cancelReason: reason }),
  });
  return res.json();
}


⸻

5️⃣ Webhook 설정 (/api/webhooks/toss)

경로: app/api/webhooks/toss/route.ts

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("TossPayments-Signature");

  const expected = crypto
    .createHmac("sha512", process.env.TOSS_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected)
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const event = JSON.parse(rawBody);
  const { eventType, data } = event;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (eventType === "PAYMENT_STATUS_CHANGED") {
    await supabase.from("payment_logs").insert({
      order_id: data.orderId,
      status: data.status,
      amount: data.amount.total,
    });
  }

  return NextResponse.json({ ok: true });
}


⸻

6️⃣ TossPayments 콘솔 설정 요약

설정 항목	경로	예시 값
Client Key	개발자센터 → API 키	test_ck_...
Secret Key	동일 위치	test_sk_...
Webhook URL	콘솔 → Webhook 설정	https://yourdomain.com/api/webhooks/toss
Webhook Secret	생성 후 .env.local에 저장	whsec_...


⸻

✅ 테스트 시나리오
	1.	npm run dev 실행 후 /subscribe 페이지 열기
	2.	TossPayments 테스트 결제 진행 (카드번호 4111-1111-1111-1111)
	3.	successUrl 호출 → 결제 승인 → Supabase payment_logs에 저장
	4.	Toss Console → Webhook Test → 로그 확인

