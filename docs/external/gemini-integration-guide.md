
# 🚀 Gemini API Integration Guide (for 365일 사주)

## 1. 환경 변수 설정 (.env.local)
```bash
GEMINI_API_KEY=AIzaSy...
NEXT_PUBLIC_SAJU_MODE=production
```

> GEMINI_API_KEY는 반드시 서버사이드(route.ts)에서만 접근해야 하며, 클라이언트 코드에서는 노출 금지.

---

## 2. 프롬프트 로드 구조

```ts
import promptText from "@/docs/prompts/daily-saju.md";

export function dailySajuPrompt({ name, birthDate, birthTime, gender, todayDate }: any) {
  return promptText
    .replace("${name}", name)
    .replace("${birthDate}", birthDate)
    .replace("${birthTime}", birthTime || "모름")
    .replace("${gender}", gender || "미상")
    .replace("${todayDate}", todayDate);
}
```

---

## 3. API 라우트 구성

```ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { dailySajuPrompt } from "@/lib/prompts/dailySajuPrompt";
import { createClient } from "@supabase/supabase-js";

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, name, birthDate, birthTime, gender, plan } = body;

  const todayDate = new Date().toISOString().split("T")[0];
  const prompt = dailySajuPrompt({ name, birthDate, birthTime, gender, todayDate });

  const modelType = plan === "paid" ? "gemini-2.5-pro" : "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({ model: modelType });

  try {
    const result = await model.generateContent(prompt);
    const text = (await result.response).text();

    await supabase.from("analysis").insert([
      { user_id: userId, type: plan === "paid" ? "daily" : "free", input: { name, birthDate, birthTime, gender }, output_markdown: text }
    ]);

    return NextResponse.json({ success: true, text });
  } catch (err) {
    console.error("Gemini Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
```

---

## 4. 호출 예시

```ts
const response = await fetch("/api/saju/daily", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: clerkUser.id, name: "홍길동", birthDate: "1990-03-21", birthTime: "10:30", gender: "남성", plan: user.plan }),
});
const data = await response.json();
console.log(data.text);
```

---

## 5. 로직 구조 개요

| 구분 | 모델 | 일일 제한 | 출력 수준 | 대상 |
|------|--------|------------|-------------|--------|
| 무료 체험자 | gemini-2.5-flash | 3회 | 간결형 리포트 | 신규 사용자 |
| 유료 구독자 | gemini-2.5-pro | 1회/일 | 정밀형 리포트 | 구독 사용자 |

---

## 6. Supabase 트리거 구조

```sql
CREATE OR REPLACE FUNCTION generate_daily_saju()
RETURNS void AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, name, birth_date, birth_time, gender FROM users WHERE plan = 'paid'
  LOOP
    PERFORM http_post(
      'https://yourdomain.com/api/saju/daily',
      json_build_object('userId', r.id, 'name', r.name, 'birthDate', r.birth_date, 'birthTime', r.birth_time, 'gender', r.gender, 'plan', 'paid')::text
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. 보안 및 운영 팁

| 주제 | 권장 조치 |
|------|------------|
| API Key 관리 | `.env.local`에서만 관리. Vercel 환경변수로 등록 |
| 무료/유료 구분 | Supabase `users.plan` 값(`free` / `paid`) 기반 |
| 요청 제한 | 무료는 `tests_remaining` 값으로 제어 |
| 응답 저장 | Gemini 결과를 `analysis` 테이블에 저장 |
| 오류 처리 | 무료 체험 복구 로직(`tests_remaining += 1`) 수행 |

---

## 8. 참고 링크

- [Gemini API 문서](https://ai.google.dev/gemini-api/docs/quickstart?hl=ko)
- [Supabase Functions](https://supabase.com/docs/guides/functions)
- [Next.js Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
