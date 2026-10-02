/*
# Storage — owner-scoped sneaker-images policies

## Overview
Replaces the open anon storage policies with authenticated-only,
owner-scoped policies. Uploads paths follow the pattern
`{item_id}/{timestamp}-{random}.ext`, and ownership is verified by
checking that the item_id prefix belongs to the authenticated user
via the sneaker_items table. Legacy files (from before auth) are
readable by the first registered user, matching the database RLS
strategy.

## Security changes
- SELECT: authenticated only, file must belong to user's item
  (or be a legacy file with NULL user_id on its sneaker_images row)
- INSERT: authenticated only, path's item_id must belong to user
- UPDATE: authenticated only, same ownership check
- DELETE: authenticated only, same ownership check
- anon role gets no storage access
*/

-- Drop old anon policies
DROP POLICY IF EXISTS "allow_select_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_insert_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_update_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "allow_delete_sneaker_images" ON storage.objects;

-- SELECT: user can read files for their own items
DROP POLICY IF EXISTS "owner_read_sneaker_images" ON storage.objects;
CREATE POLICY "owner_read_sneaker_images" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND (
        sneaker_images.user_id = auth.uid()
        OR (sneaker_images.user_id IS NULL
            AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
      )
    )
  );

-- INSERT: path must start with an item_id the user owns
DROP POLICY IF EXISTS "owner_insert_sneaker_images" ON storage.objects;
CREATE POLICY "owner_insert_sneaker_images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_items
      WHERE sneaker_items.id::text = split_part((storage.objects.name)::text, '/', 1)
      AND (
        sneaker_items.user_id = auth.uid()
        OR (sneaker_items.user_id IS NULL
            AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
      )
    )
  );

-- UPDATE: same ownership check
DROP POLICY IF EXISTS "owner_update_sneaker_images" ON storage.objects;
CREATE POLICY "owner_update_sneaker_images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND (
        sneaker_images.user_id = auth.uid()
        OR (sneaker_images.user_id IS NULL
            AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
      )
    )
  ) WITH CHECK (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND sneaker_images.user_id = auth.uid()
    )
  );

-- DELETE: same ownership check
DROP POLICY IF EXISTS "owner_delete_sneaker_images" ON storage.objects;
CREATE POLICY "owner_delete_sneaker_images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND (
        sneaker_images.user_id = auth.uid()
        OR (sneaker_images.user_id IS NULL
            AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
      )
    )
  );