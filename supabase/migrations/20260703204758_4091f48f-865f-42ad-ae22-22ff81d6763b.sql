
CREATE TABLE public.google_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','esgotada')),
  credits_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_accounts TO service_role;

ALTER TABLE public.google_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON public.google_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID,
  project_id UUID,
  prompt TEXT NOT NULL,
  character_image TEXT,
  property_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  flow_model TEXT NOT NULL DEFAULT 'fast' CHECK (flow_model IN ('lite','fast','quality')),
  google_account TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN (
    'rascunho','pronto_para_gerar','em_geracao',
    'gerado','erro','aprovado','entregue'
  )),
  video_url TEXT,
  file_name TEXT,
  error_screenshot TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.video_jobs TO service_role;

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON public.video_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_video_jobs_status ON public.video_jobs(status);
CREATE INDEX idx_video_jobs_project ON public.video_jobs(project_id);
CREATE INDEX idx_google_accounts_status ON public.google_accounts(status);

CREATE TRIGGER set_google_accounts_updated_at
  BEFORE UPDATE ON public.google_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_video_jobs_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
