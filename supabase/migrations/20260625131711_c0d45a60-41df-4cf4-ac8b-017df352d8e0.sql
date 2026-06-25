
-- 1) Tabela clients (imobiliárias)
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_name text,
  contact text,
  logo_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO anon, authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read clients" ON public.clients FOR SELECT USING (true);
CREATE POLICY "public insert clients" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "public update clients" ON public.clients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete clients" ON public.clients FOR DELETE USING (true);

CREATE TRIGGER set_updated_at_clients
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) FK em projects -> clients
ALTER TABLE public.projects ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE RESTRICT;

-- 3) Cria "Instagram" e faz backfill
WITH novo AS (
  INSERT INTO public.clients (name, trade_name)
  VALUES ('Instagram', 'Instagram Imóveis')
  RETURNING id
)
UPDATE public.projects SET client_id = (SELECT id FROM novo) WHERE client_id IS NULL;

-- 4) Agora torna obrigatório
ALTER TABLE public.projects ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX idx_projects_client_id ON public.projects(client_id);
