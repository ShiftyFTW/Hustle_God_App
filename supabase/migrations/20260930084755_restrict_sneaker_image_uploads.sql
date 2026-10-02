/*
  # Restrict photo uploads to real images of a bounded size

  The sneaker-images bucket had no file_size_limit and no allowed_mime_types,
  so any caller could upload a file of any type and any size into a public
  bucket. The only type check lived in the browser and was bypassable by
  calling the storage API directly.

  1. Bucket configuration
     - file_size_limit: 15 MB, comfortably above any phone photo
     - allowed_mime_types: the image formats the uploader advertises, plus
       heic/heif which phones produce

  The bucket stays public so the AI functions and the photo grid can keep
  reading images by URL; only what may be written is narrowed.
*/

UPDATE storage.buckets
SET
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
WHERE id = 'sneaker-images';
