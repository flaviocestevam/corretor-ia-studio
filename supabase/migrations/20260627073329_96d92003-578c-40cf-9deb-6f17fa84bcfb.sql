ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'reels';
ALTER TABLE public.projects ADD CONSTRAINT projects_project_type_check CHECK (project_type IN ('reels','tour'));
ALTER TABLE public.projects ALTER COLUMN character_id DROP NOT NULL;