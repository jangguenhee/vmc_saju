# Supabase Cron Job 설정 가이드

Next.js API 라우트를 주기적으로 호출하여 자동화 작업을 실행합니다.

---

## 1. 필수 조건

- ✅ Supabase 프로젝트 생성 완료
- ✅ pg_cron extension 활성화 (Supabase는 기본 활성화)
- ✅ pg_net extension 활성화 (HTTP 요청용)
- ✅ Vercel 배포 완료 (또는 공개 HTTPS URL)

---

## 2. Extension 확인 및 활성화

Supabase Dashboard → **SQL Editor**로 이동하여 실행:

```sql
-- pg_cron extension 확인
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- pg_net extension 확인 및 활성화
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 확인
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

---

## 3. Cron Job 등록

### 3.1. 일일 운세 자동 생성

**실행 시간**: 매일 자정 (KST 00:00)

```sql
-- Daily Report Cron Job
SELECT cron.schedule(
  'daily-fortune-report',       -- Job name
  '0 0 * * *',                   -- Every day at midnight (UTC)
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.com/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET_HERE'
      )
    );
  $$
);
```

**주의사항**:
- `yourdomain.com`을 실제 Vercel 배포 URL로 변경
- `YOUR_CRON_SECRET_HERE`를 `.env.local`의 `CRON_SECRET` 값으로 변경
- UTC 기준이므로 KST(UTC+9) 자정은 `0 15 * * *` (전날 오후 3시 UTC)

**KST 자정 기준**:
```sql
SELECT cron.schedule(
  'daily-fortune-report',
  '0 15 * * *',  -- UTC 15:00 = KST 00:00 (다음날)
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.com/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET_HERE'
      )
    );
  $$
);
```

### 3.2. 월간 자동 결제

**실행 시간**: 매일 오전 1시 (KST 01:00)

```sql
-- Monthly Billing Cron Job
SELECT cron.schedule(
  'monthly-billing',
  '0 16 * * *',  -- UTC 16:00 = KST 01:00 (다음날)
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.com/api/cron/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET_HERE'
      )
    );
  $$
);
```

---

## 4. Cron 표현식 가이드

| 표현식 | 의미 | 예시 |
|--------|------|------|
| `* * * * *` | 매분 | 테스트용 (주의!) |
| `0 * * * *` | 매시간 정각 | 00:00, 01:00, 02:00... |
| `0 0 * * *` | 매일 자정 (UTC) | 00:00 UTC |
| `0 15 * * *` | 매일 15:00 (UTC) | KST 다음날 00:00 |
| `0 16 * * *` | 매일 16:00 (UTC) | KST 다음날 01:00 |
| `0 0 1 * *` | 매월 1일 자정 | 월초 작업 |
| `0 0 * * 0` | 매주 일요일 자정 | 주간 작업 |

**Format**: `분 시 일 월 요일`

---

## 5. Cron Job 관리

### 등록된 Cron Job 확인

```sql
-- 모든 cron job 조회
SELECT * FROM cron.job;

-- 특정 job 조회
SELECT * FROM cron.job WHERE jobname = 'daily-fortune-report';
```

### Cron Job 삭제

```sql
-- Job ID로 삭제
SELECT cron.unschedule(1);

-- Job name으로 삭제 (Supabase 특정 기능)
SELECT cron.unschedule('daily-fortune-report');
SELECT cron.unschedule('monthly-billing');
```

### Cron Job 수정

```sql
-- 기존 job 삭제 후 재생성
SELECT cron.unschedule('daily-fortune-report');

-- 새로운 스케줄로 재등록
SELECT cron.schedule(
  'daily-fortune-report',
  '0 15 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://yourdomain.com/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer NEW_SECRET'
      )
    );
  $$
);
```

---

## 6. 실행 로그 확인

### Cron Job 실행 이력

```sql
-- 최근 실행 이력 조회
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;

-- 특정 job의 실행 이력
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-fortune-report')
ORDER BY start_time DESC
LIMIT 10;

-- 실패한 실행만 조회
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC;
```

### HTTP 요청 로그 확인

```sql
-- pg_net HTTP 요청 로그
SELECT * FROM net._http_response
ORDER BY created DESC
LIMIT 20;

-- 실패한 요청만 조회
SELECT * FROM net._http_response
WHERE status_code >= 400
ORDER BY created DESC;
```

---

## 7. 환경 변수 설정

### `.env.local` 파일 추가

```bash
# Cron Job Authorization
CRON_SECRET=your_secure_random_secret_here
```

**Secret 생성**:
```bash
# macOS/Linux
openssl rand -base64 32

# 또는 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Vercel 환경 변수 설정

Vercel Dashboard → 프로젝트 → **Settings** → **Environment Variables**:
- `CRON_SECRET`: (생성한 secret 값)

---

## 8. 로컬 테스트

### 로컬에서 Cron API 테스트

```bash
# Daily Report 테스트
curl -X GET http://localhost:3000/api/cron/daily-report \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Billing 테스트
curl -X GET http://localhost:3000/api/cron/billing \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### ngrok으로 외부 접근 테스트

```bash
# ngrok 실행
ngrok http 3000

# Supabase에서 ngrok URL로 테스트
SELECT
  net.http_post(
    url := 'https://abc123.ngrok.io/api/cron/daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    )
  );
```

---

## 9. 프로덕션 배포 체크리스트

### 배포 전 확인

- [ ] Vercel에 배포 완료
- [ ] 환경 변수 `CRON_SECRET` 설정 완료
- [ ] `/api/cron/daily-report` 수동 호출 테스트 성공
- [ ] `/api/cron/billing` 수동 호출 테스트 성공
- [ ] Supabase에 pg_net extension 활성화 확인

### Cron Job 등록

```sql
-- 1. Daily Report (매일 KST 00:00)
SELECT cron.schedule(
  'daily-fortune-report',
  '0 15 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-production-domain.vercel.app/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      )
    );
  $$
);

-- 2. Billing (매일 KST 01:00)
SELECT cron.schedule(
  'monthly-billing',
  '0 16 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://your-production-domain.vercel.app/api/cron/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      )
    );
  $$
);
```

### 등록 확인

```sql
-- Cron job 확인
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('daily-fortune-report', 'monthly-billing');

-- 다음 실행 시간 확인
SELECT jobid, jobname, schedule,
       cron.schedule_to_timestamp(schedule, timezone := 'UTC') AS next_run
FROM cron.job
WHERE jobname IN ('daily-fortune-report', 'monthly-billing');
```

---

## 10. 모니터링

### 일일 체크

```sql
-- 오늘 실행된 cron job 확인
SELECT j.jobname, r.status, r.start_time, r.end_time,
       EXTRACT(EPOCH FROM (r.end_time - r.start_time)) AS duration_seconds
FROM cron.job_run_details r
JOIN cron.job j ON r.jobid = j.jobid
WHERE r.start_time >= CURRENT_DATE
ORDER BY r.start_time DESC;

-- 오늘 생성된 분석 개수 확인
SELECT type, COUNT(*) as count
FROM analysis
WHERE created_at >= CURRENT_DATE
GROUP BY type;

-- 오늘 결제 로그 확인
SELECT status, COUNT(*) as count, SUM(amount) as total_amount
FROM payment_logs
WHERE created_at >= CURRENT_DATE
GROUP BY status;
```

### 주간 리포트

```sql
-- 지난 7일간 통계
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE type = 'daily') as daily_reports,
  COUNT(*) FILTER (WHERE type = 'free') as free_analyses
FROM analysis
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 지난 7일간 결제 통계
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE status = 'success') as success_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  SUM(amount) FILTER (WHERE status = 'success') as total_revenue
FROM payment_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 11. 트러블슈팅

### ❌ Cron Job이 실행되지 않음

**원인 1**: pg_net extension 미활성화
```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

**원인 2**: URL이 HTTPS가 아님
- Vercel은 자동으로 HTTPS 제공
- ngrok도 HTTPS 제공

**원인 3**: Cron 표현식 오류
```sql
-- 잘못된 예
'0 0 * * *'  -- UTC 자정 (KST 오전 9시)

-- 올바른 예 (KST 자정)
'0 15 * * *'  -- UTC 15:00 (KST 다음날 00:00)
```

### ❌ HTTP 401 Unauthorized

**원인**: CRON_SECRET 불일치

**해결**:
1. `.env.local`의 `CRON_SECRET` 확인
2. Vercel 환경 변수 확인
3. SQL 쿼리의 Authorization 헤더 확인

### ❌ HTTP 500 Internal Error

**원인**: API 라우트 내부 에러

**해결**:
1. Vercel 로그 확인: `vercel logs`
2. Supabase 연결 확인
3. Gemini API Key 확인
4. TossPayments API Key 확인

### ❌ Cron Job은 성공하지만 데이터가 생성되지 않음

**디버깅**:
```sql
-- HTTP 응답 확인
SELECT * FROM net._http_response
ORDER BY created DESC
LIMIT 5;

-- 응답 내용 확인
SELECT
  id,
  status_code,
  content::text as response_body,
  created
FROM net._http_response
ORDER BY created DESC
LIMIT 1;
```

**API 응답 로그 확인**:
- Vercel Dashboard → Deployments → Logs
- "No users need daily report" 또는 "No users need billing today" 확인

---

## 12. 고급 설정

### Retry 로직

Cron job이 실패할 경우 재시도:

```sql
-- 5분 간격으로 3번 재시도
SELECT cron.schedule(
  'daily-fortune-report-retry',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  DO $$
  DECLARE
    response record;
    attempt int := 0;
  BEGIN
    WHILE attempt < 3 LOOP
      attempt := attempt + 1;

      SELECT * INTO response FROM net.http_post(
        url := 'https://yourdomain.com/api/cron/daily-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_CRON_SECRET'
        )
      );

      IF response.status_code < 400 THEN
        EXIT;
      END IF;

      PERFORM pg_sleep(60); -- Wait 1 minute between retries
    END LOOP;
  END $$;
  $$
);
```

### 알림 통합

실패 시 Slack/Discord 알림:

```sql
SELECT cron.schedule(
  'daily-report-with-notification',
  '0 15 * * *',
  $$
  DO $$
  DECLARE
    response record;
  BEGIN
    SELECT * INTO response FROM net.http_post(
      url := 'https://yourdomain.com/api/cron/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_CRON_SECRET'
      )
    );

    IF response.status_code >= 400 THEN
      -- Send Slack notification
      PERFORM net.http_post(
        url := 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'text', '🚨 Daily Report Cron Failed! Status: ' || response.status_code
        )
      );
    END IF;
  END $$;
  $$
);
```

---

## 13. 참고 문서

- [Supabase Cron Documentation](https://supabase.com/docs/guides/database/extensions/pg_cron)
- [pg_cron GitHub](https://github.com/citusdata/pg_cron)
- [pg_net Documentation](https://github.com/supabase/pg_net)
- [Cron Expression Guide](https://crontab.guru/)
