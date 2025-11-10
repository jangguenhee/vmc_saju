-- Migration: Add output_json column to analysis table
-- Created: 2025-11-10
-- Description: Add output_json JSONB column for structured analysis data visualization

-- ============================================================================
-- Add output_json column to analysis table
-- ============================================================================

ALTER TABLE analysis
ADD COLUMN IF NOT EXISTS output_json JSONB;

-- Add comment
COMMENT ON COLUMN analysis.output_json IS 'AI 분석 결과 (JSON 형식): scores, aspects, lucky_elements, warnings';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'analysis'
    AND column_name = 'output_json'
  ) THEN
    RAISE EXCEPTION 'output_json column was not added';
  END IF;

  RAISE NOTICE 'output_json column added successfully to analysis table';
END $$;
