-- Migration: Add Supabase Cron for Daily Billing
-- Created: 2025-10-27
-- Description: Setup pg_cron for automatic billing at 02:00 KST

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing job if it exists (safe method)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-billing-job');
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Job daily-billing-job does not exist, skipping unschedule';
END $$;

-- Create Daily Billing Job
-- Runs at 02:00 KST (17:00 UTC) every day
-- Note: KST = UTC+9, so 02:00 KST = 17:00 UTC
SELECT cron.schedule(
  'daily-billing-job',
  '0 17 * * *',  -- Cron expression: minute hour day month weekday
  $$
  SELECT
    net.http_post(
      url := 'https://vcm-saju.vercel.app/api/cron/billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body := jsonb_build_object(
        'timestamp', now()::text,
        'trigger', 'cron'
      )
    ) AS request_id;
  $$
);

-- Verify cron job was created
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'daily-billing-job';
  
  IF job_count = 0 THEN
    RAISE EXCEPTION 'Cron job was not created';
  ELSE
    RAISE NOTICE 'Cron job "daily-billing-job" created successfully';
    RAISE NOTICE 'Schedule: Every day at 02:00 KST (17:00 UTC)';
    RAISE NOTICE 'Next step: Set CRON_SECRET in environment variables';
  END IF;
END $$;

-- ============================================================================
-- IMPORTANT: Set Cron Secret
-- ============================================================================
-- 
-- After running this migration, you MUST set the cron secret:
-- 
-- Option 1: SQL Editor
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'your-random-secret-here';
-- 
-- Option 2: Supabase Dashboard
-- Settings > Database > Custom Postgres Config
-- Add: app.settings.cron_secret = 'your-random-secret-here'
-- 
-- Then set the same secret in your .env.local:
-- CRON_SECRET=your-random-secret-here
-- 
-- ============================================================================

-- View scheduled jobs
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'daily-billing-job';