-- Separate search method from entry source while keeping prior analytics intact.
ALTER TABLE search_submission_receipts
  ADD COLUMN IF NOT EXISTS search_mode TEXT NOT NULL DEFAULT 'traditional';
ALTER TABLE search_submission_receipts DROP CONSTRAINT IF EXISTS search_submission_receipts_search_mode_check;
ALTER TABLE search_submission_receipts ADD CONSTRAINT search_submission_receipts_search_mode_check CHECK (search_mode IN ('traditional','ai_assisted','semantic'));
ALTER TABLE search_submission_receipts ALTER COLUMN source TYPE TEXT;
ALTER TABLE search_submission_receipts DROP CONSTRAINT IF EXISTS search_submission_receipts_source_check;
ALTER TABLE search_submission_receipts ADD CONSTRAINT search_submission_receipts_source_check CHECK (source IN ('typed','chip','suggested'));

ALTER TABLE website_search_engagement_daily
  ADD COLUMN IF NOT EXISTS search_mode TEXT NOT NULL DEFAULT 'traditional';
ALTER TABLE website_search_engagement_daily DROP CONSTRAINT IF EXISTS website_search_engagement_daily_source_check;
ALTER TABLE website_search_engagement_daily ALTER COLUMN source TYPE TEXT;
ALTER TABLE website_search_engagement_daily ADD CONSTRAINT website_search_engagement_daily_source_check CHECK (source IN ('typed','chip','suggested'));
ALTER TABLE website_search_engagement_daily DROP CONSTRAINT IF EXISTS website_search_engagement_daily_search_mode_check;
ALTER TABLE website_search_engagement_daily ADD CONSTRAINT website_search_engagement_daily_search_mode_check CHECK (search_mode IN ('traditional','ai_assisted','semantic'));
ALTER TABLE website_search_engagement_daily DROP CONSTRAINT IF EXISTS website_search_engagement_daily_pkey;
ALTER TABLE website_search_engagement_daily ADD CONSTRAINT website_search_engagement_daily_pkey PRIMARY KEY (report_date,topic_ref,source,search_mode);

ALTER TABLE website_search_result_click_daily
  ADD COLUMN IF NOT EXISTS search_mode TEXT NOT NULL DEFAULT 'traditional';
ALTER TABLE website_search_result_click_daily DROP CONSTRAINT IF EXISTS website_search_result_click_daily_source_check;
ALTER TABLE website_search_result_click_daily ALTER COLUMN source TYPE TEXT;
ALTER TABLE website_search_result_click_daily ADD CONSTRAINT website_search_result_click_daily_source_check CHECK (source IN ('typed','chip','suggested'));
ALTER TABLE website_search_result_click_daily DROP CONSTRAINT IF EXISTS website_search_result_click_daily_search_mode_check;
ALTER TABLE website_search_result_click_daily ADD CONSTRAINT website_search_result_click_daily_search_mode_check CHECK (search_mode IN ('traditional','ai_assisted','semantic'));
ALTER TABLE website_search_result_click_daily DROP CONSTRAINT IF EXISTS website_search_result_click_daily_pkey;
ALTER TABLE website_search_result_click_daily ADD CONSTRAINT website_search_result_click_daily_pkey PRIMARY KEY (report_date,topic_ref,source,search_mode,result_type,position_bucket);
