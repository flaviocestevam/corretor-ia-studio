
-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- CHARACTERS
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_bio TEXT,
  personality TEXT,
  speaking_style TEXT,
  catchphrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  canonical_prompt TEXT,
  canonical_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  hooks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ctas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO anon, authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read characters" ON public.characters FOR SELECT USING (true);
CREATE POLICY "public insert characters" ON public.characters FOR INSERT WITH CHECK (true);
CREATE POLICY "public update characters" ON public.characters FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete characters" ON public.characters FOR DELETE USING (true);
CREATE TRIGGER trg_characters_updated BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROJECTS
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "public insert projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "public update projects" ON public.projects FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete projects" ON public.projects FOR DELETE USING (true);
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SCENES
CREATE TABLE public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_order INTEGER NOT NULL,
  room_name TEXT NOT NULL,
  original_room_image TEXT,
  generated_character_image TEXT,
  hook_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_hook JSONB,
  script_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_script TEXT,
  cta TEXT,
  image_prompt TEXT,
  video_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO anon, authenticated;
GRANT ALL ON public.scenes TO service_role;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read scenes" ON public.scenes FOR SELECT USING (true);
CREATE POLICY "public insert scenes" ON public.scenes FOR INSERT WITH CHECK (true);
CREATE POLICY "public update scenes" ON public.scenes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete scenes" ON public.scenes FOR DELETE USING (true);
CREATE INDEX scenes_project_order_idx ON public.scenes (project_id, scene_order);
CREATE TRIGGER trg_scenes_updated BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
