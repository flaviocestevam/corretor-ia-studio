
CREATE TABLE public.animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  species text,
  short_bio text,
  canonical_image text,
  canonical_prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.animals TO authenticated, anon;
GRANT ALL ON public.animals TO service_role;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read animals" ON public.animals FOR SELECT USING (true);
CREATE POLICY "public insert animals" ON public.animals FOR INSERT WITH CHECK (true);
CREATE POLICY "public update animals" ON public.animals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete animals" ON public.animals FOR DELETE USING (true);
CREATE TRIGGER set_animals_updated_at BEFORE UPDATE ON public.animals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ADD COLUMN animal_id uuid REFERENCES public.animals(id) ON DELETE SET NULL;
ALTER TABLE public.scenes ADD COLUMN negative_prompt text;
ALTER TABLE public.scenes ADD COLUMN route_summary text;
