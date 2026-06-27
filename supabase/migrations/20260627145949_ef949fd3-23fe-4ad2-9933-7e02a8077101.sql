
DROP POLICY IF EXISTS "Authenticated users can view api keys" ON public.google_api_keys;
DROP POLICY IF EXISTS "Authenticated users can insert api keys" ON public.google_api_keys;
DROP POLICY IF EXISTS "Authenticated users can update api keys" ON public.google_api_keys;
DROP POLICY IF EXISTS "Authenticated users can delete api keys" ON public.google_api_keys;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_api_keys TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_api_keys TO authenticated;
GRANT ALL ON public.google_api_keys TO service_role;

CREATE POLICY "Public can manage api keys" ON public.google_api_keys FOR ALL USING (true) WITH CHECK (true);
