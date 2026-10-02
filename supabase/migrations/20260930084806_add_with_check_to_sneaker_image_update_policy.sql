/*
  # Add a write check to the photo update policy

  allow_update_sneaker_images had a USING clause and no WITH CHECK, so only
  the row as it was got validated. The row as it will be was unconstrained,
  which let a caller update an object and move it into a different bucket by
  setting bucket_id, escaping the fence the policy was written to enforce.

  1. Security
     - Recreate the UPDATE policy with a matching WITH CHECK so both the
       pre-image and the post-image must stay inside the sneaker-images bucket.

  Behaviour for the app is unchanged: it only ever updates objects that stay
  in this bucket.
*/

DROP POLICY IF EXISTS "allow_update_sneaker_images" ON storage.objects;

CREATE POLICY "allow_update_sneaker_images" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'sneaker-images')
  WITH CHECK (bucket_id = 'sneaker-images');
