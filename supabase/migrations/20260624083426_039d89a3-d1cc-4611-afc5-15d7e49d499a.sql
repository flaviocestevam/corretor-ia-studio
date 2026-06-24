ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS face_reference_image text,
  ADD COLUMN IF NOT EXISTS body_reference_image text,
  ADD COLUMN IF NOT EXISTS active_outfit_image text;