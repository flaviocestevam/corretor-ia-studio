REVOKE ALL ON public.google_api_keys FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_api_keys TO authenticated;
GRANT ALL ON public.google_api_keys TO service_role;

DROP POLICY IF EXISTS "Allow all to select" ON public.google_api_keys;
DROP POLICY IF EXISTS "Allow all to insert" ON public.google_api_keys;
DROP POLICY IF EXISTS "Allow all to update" ON public.google_api_keys;
DROP POLICY IF EXISTS "Allow all to delete" ON public.google_api_keys;
DROP POLICY IF EXISTS "Public read" ON public.google_api_keys;
DROP POLICY IF EXISTS "Public insert" ON public.google_api_keys;
DROP POLICY IF EXISTS "Public update" ON public.google_api_keys;
DROP POLICY IF EXISTS "Public delete" ON public.google_api_keys;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.google_api_keys;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.google_api_keys;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.google_api_keys;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.google_api_keys;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='google_api_keys' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.google_api_keys', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.google_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view api keys"
  ON public.google_api_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert api keys"
  ON public.google_api_keys FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update api keys"
  ON public.google_api_keys FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete api keys"
  ON public.google_api_keys FOR DELETE TO authenticated USING (true);