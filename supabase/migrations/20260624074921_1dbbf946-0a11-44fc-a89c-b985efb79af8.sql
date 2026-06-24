
CREATE POLICY "public read scene-assets" ON storage.objects FOR SELECT
  USING (bucket_id = 'scene-assets');
CREATE POLICY "public upload scene-assets" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'scene-assets');
CREATE POLICY "public update scene-assets" ON storage.objects FOR UPDATE
  USING (bucket_id = 'scene-assets') WITH CHECK (bucket_id = 'scene-assets');
CREATE POLICY "public delete scene-assets" ON storage.objects FOR DELETE
  USING (bucket_id = 'scene-assets');
