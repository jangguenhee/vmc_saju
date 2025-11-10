# Clerk Webhook 설정 가이드

Clerk 웹훅을 설정하여 사용자 가입/수정/삭제 이벤트를 Supabase 데이터베이스와 자동 동기화합니다.

---

## 1. 필수 조건

- ✅ Clerk 프로젝트 생성 완료
- ✅ Supabase 데이터베이스 마이그레이션 완료
- ✅ `.env.local`에 Clerk 및 Supabase 환경 변수 설정

---

## 2. Clerk Dashboard에서 웹훅 설정

### Step 1: Clerk Dashboard 접속

1. https://dashboard.clerk.com 로그인
2. 해당 프로젝트 선택
3. 좌측 메뉴 → **Configure** → **Webhooks** 클릭

### Step 2: 새 엔드포인트 추가

1. **"Add Endpoint"** 버튼 클릭

2. **Endpoint URL** 입력:
   ```
   로컬 개발: https://localhost:3000/api/webhooks/clerk
   배포 환경: https://YOUR-APP.vercel.app/api/webhooks/clerk
   ```

   ⚠️ **로컬 테스트 시**: Clerk는 공개 URL만 지원하므로, ngrok 또는 Cloudflare Tunnel 사용 필요

   ```bash
   # ngrok 사용 예시
   npx ngrok http 3000
   # 생성된 HTTPS URL 사용: https://xxxx-xx-xxx-xx-xx.ngrok.io/api/webhooks/clerk
   ```

3. **Subscribe to events** 섹션에서 다음 이벤트 선택:
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`

4. **Advanced Configuration** 펼치기 → Signing Secret 확인

5. **Create** 클릭

### Step 3: Signing Secret 복사

Webhook 생성 후 표시되는 **Signing Secret** 복사 (형식: `whsec_xxxxx...`)

---

## 3. 환경 변수 설정

`.env.local` 파일에 Clerk Webhook Secret 추가:

```bash
# Clerk Webhook
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **주의**: 이 값은 절대 Git에 커밋하지 마세요!

---

## 4. 웹훅 테스트

### 로컬 테스트 (ngrok 사용)

1. **ngrok 실행**:
   ```bash
   npx ngrok http 3000
   ```

2. **Clerk Webhook URL 업데이트**:
   - Clerk Dashboard에서 생성한 Webhook 편집
   - Endpoint URL을 ngrok URL로 변경: `https://xxxx.ngrok.io/api/webhooks/clerk`

3. **Next.js 개발 서버 실행**:
   ```bash
   npm run dev
   ```

4. **Clerk Dashboard에서 테스트 이벤트 전송**:
   - Webhooks → 생성한 엔드포인트 클릭
   - **"Testing"** 탭 → **"Send test event"**
   - `user.created` 이벤트 선택 → **Send**

5. **터미널 로그 확인**:
   ```
   [Clerk Webhook] Received event: user.created
   [Clerk Webhook] ✅ User created: test@example.com (user_xxxxx)
   ```

6. **Supabase 확인**:
   - Supabase Dashboard → Table Editor → `users` 테이블
   - 테스트 사용자가 추가되었는지 확인

### 배포 환경 테스트 (Vercel)

1. **Vercel에 환경 변수 추가**:
   - Vercel Dashboard → 프로젝트 선택
   - Settings → Environment Variables
   - `CLERK_WEBHOOK_SECRET` 추가

2. **배포 후 Webhook URL 업데이트**:
   ```
   https://your-app.vercel.app/api/webhooks/clerk
   ```

3. **실제 회원가입 테스트**:
   - 앱에서 Google 로그인 시도
   - 회원가입 완료 후 Supabase `users` 테이블 확인

---

## 5. 동작 확인

### user.created 이벤트

사용자가 회원가입하면:

1. Clerk에서 사용자 생성
2. Clerk → 웹훅 전송 → Next.js API
3. Next.js → Supabase `users` 테이블에 INSERT:
   ```sql
   INSERT INTO users (id, email, name, plan, tests_remaining)
   VALUES ('clerk_user_id', 'user@example.com', 'John Doe', 'free', 3);
   ```

### user.updated 이벤트

사용자가 이메일 또는 이름을 변경하면:

1. Clerk에서 사용자 정보 업데이트
2. Clerk → 웹훅 전송
3. Next.js → Supabase `users` 테이블 UPDATE

### user.deleted 이벤트

사용자가 계정을 삭제하면:

1. Clerk에서 사용자 삭제
2. Clerk → 웹훅 전송
3. Next.js → Supabase `users` 테이블 DELETE (CASCADE로 관련 레코드도 삭제)

---

## 6. 트러블슈팅

### ❌ 400 Invalid signature

**원인**: Webhook Secret이 일치하지 않음

**해결**:
```bash
# 1. Clerk Dashboard에서 Secret 다시 확인
# 2. .env.local 파일 업데이트
CLERK_WEBHOOK_SECRET=whsec_새로운시크릿

# 3. 개발 서버 재시작
npm run dev
```

### ❌ 500 Database insert failed

**원인**: Supabase 연결 오류 또는 RLS 정책 문제

**해결**:
1. `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY` 설정 확인
2. Supabase `users` 테이블 생성 확인
3. RLS 정책이 Service Role 허용하는지 확인

```sql
-- RLS 정책 확인
SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
```

### ❌ Webhook 이벤트가 수신되지 않음

**원인**: Endpoint URL이 잘못되었거나 이벤트 구독 안 됨

**해결**:
1. Clerk Dashboard → Webhooks → 엔드포인트 확인
2. Subscribe to events에서 `user.created`, `user.updated`, `user.deleted` 체크 확인
3. Endpoint URL이 HTTPS인지 확인 (HTTP는 지원 안 됨)

### ❌ 로컬에서 웹훅이 작동하지 않음

**원인**: Clerk는 공개 HTTPS URL만 지원

**해결**: ngrok 또는 Cloudflare Tunnel 사용

```bash
# ngrok 설치 및 실행
npx ngrok http 3000

# 또는 Cloudflare Tunnel
npx cloudflared tunnel --url http://localhost:3000
```

---

## 7. 다음 단계

웹훅이 정상 작동하면:

- ✅ 1단계: 데이터베이스 설정 완료
- ✅ 2단계: Clerk 웹훅 연동 완료
- ⬜ 3단계: AI 분석 API 구현 (`/api/analysis/create`)
- ⬜ 4단계: 구독 관리 API 구현 (`/api/subscription/`)
- ⬜ 5단계: Cron 자동화 구현

---

## 8. 참고 문서

- [Clerk Webhook 공식 문서](https://clerk.com/docs/webhooks/overview)
- [Svix Webhook 검증 가이드](https://docs.svix.com/receiving/verifying-payloads/how)
- [Supabase Service Role Key 사용법](https://supabase.com/docs/guides/api#the-service_role-key)
