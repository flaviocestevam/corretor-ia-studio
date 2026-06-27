CREATE TABLE IF NOT EXISTS public.google_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_exhausted BOOLEAN NOT NULL DEFAULT false,
  exhausted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_api_keys TO anon, authenticated;
GRANT ALL ON public.google_api_keys TO service_role;

ALTER TABLE public.google_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read google_api_keys" ON public.google_api_keys FOR SELECT USING (true);
CREATE POLICY "public insert google_api_keys" ON public.google_api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "public update google_api_keys" ON public.google_api_keys FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete google_api_keys" ON public.google_api_keys FOR DELETE USING (true);

CREATE TRIGGER set_google_api_keys_updated_at
  BEFORE UPDATE ON public.google_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS generated_video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_status TEXT NOT NULL DEFAULT 'pendente' CHECK (video_status IN ('pendente','gerando','gerado','erro')),
  ADD COLUMN IF NOT EXISTS video_error TEXT,
  ADD COLUMN IF NOT EXISTS video_generated_at TIMESTAMPTZ;