DROP TABLE IF EXISTS public.google_api_keys CASCADE;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS generated_video_url;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS video_status;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS video_error;
ALTER TABLE public.scenes DROP COLUMN IF EXISTS video_generated_at;