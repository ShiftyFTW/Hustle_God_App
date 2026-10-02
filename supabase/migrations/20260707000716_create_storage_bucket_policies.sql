/*
# Supabase Storage — sneaker-images bucket

Creates the public storage bucket for sneaker photos and applies
anon+authenticated RLS policies so the frontend can upload and read images.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('sneaker-images', 'sneaker-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_select_sneaker_images" ON storage.objects;
CREATE POLICY "allow_select_sneaker_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'sneaker-images');

DROP POLICY IF EXISTS "allow_insert_sneaker_images" ON storage.objects;
CREATE POLICY "allow_insert_sneaker_images" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'sneaker-images');

DROP POLICY IF EXISTS "allow_update_sneaker_images" ON storage.objects;
CREATE POLICY "allow_update_sneaker_images" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'sneaker-images');

DROP POLICY IF EXISTS "allow_delete_sneaker_images" ON storage.objects;
CREATE POLICY "allow_delete_sneaker_images" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'sneaker-images');
