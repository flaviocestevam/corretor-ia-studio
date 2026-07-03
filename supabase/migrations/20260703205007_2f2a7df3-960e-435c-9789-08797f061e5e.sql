
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_jobs TO anon, authenticated;

CREATE POLICY "public read video_jobs" ON public.video_jobs FOR SELECT USING (true);
CREATE POLICY "public insert video_jobs" ON public.video_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "public update video_jobs" ON public.video_jobs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete video_jobs" ON public.video_jobs FOR DELETE USING (true);

ALTER TABLE public.video_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_jobs;
