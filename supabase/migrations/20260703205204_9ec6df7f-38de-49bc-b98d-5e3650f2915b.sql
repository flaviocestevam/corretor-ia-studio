
DROP POLICY IF EXISTS "public read video_jobs" ON public.video_jobs;
DROP POLICY IF EXISTS "public insert video_jobs" ON public.video_jobs;
DROP POLICY IF EXISTS "public update video_jobs" ON public.video_jobs;
DROP POLICY IF EXISTS "public delete video_jobs" ON public.video_jobs;

REVOKE ALL ON public.video_jobs FROM anon, authenticated;

ALTER PUBLICATION supabase_realtime DROP TABLE public.video_jobs;
