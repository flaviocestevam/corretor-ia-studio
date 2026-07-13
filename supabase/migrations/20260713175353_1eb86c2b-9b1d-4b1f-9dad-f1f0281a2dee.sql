
ALTER TABLE public.google_accounts
  ADD COLUMN IF NOT EXISTS password TEXT,
  ADD COLUMN IF NOT EXISTS storage_state JSONB;

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS assigned_account TEXT,
  ADD COLUMN IF NOT EXISTS property_image TEXT;
