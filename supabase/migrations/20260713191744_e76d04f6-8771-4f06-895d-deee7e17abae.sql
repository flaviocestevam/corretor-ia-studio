
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_music_mood text NOT NULL DEFAULT 'sofisticado',
  ADD COLUMN IF NOT EXISTS default_camera_framing text NOT NULL DEFAULT 'auto';

ALTER TABLE public.scenes
  ALTER COLUMN camera_framing SET DEFAULT 'auto';
