ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS camera_framing text NOT NULL DEFAULT 'corpo_inteiro';