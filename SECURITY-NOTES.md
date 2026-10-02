# Security notes — open items requiring an owner decision

These two items cannot be closed in code because the app currently has **no sign-in screen**.
There is no authentication anywhere: no login page, no session handling, and no owner column
on any record. Every screen therefore talks to the database as the shared public visitor role.

## 1. All inventory, pricing and listing data is world-readable and world-writable

Every table (`sneaker_items`, `sneaker_images`, `ai_identification`, `condition_assessment`,
`comp_research`, `listing_content`, `platform_listings`) grants `SELECT / INSERT / UPDATE / DELETE`
to the `anon` role with `USING (true)` / `WITH CHECK (true)` policies. Anyone who has the public
project URL and the public API key that ships in the browser bundle can list, edit, or delete
every item, including cost basis, floor prices, and recommended prices.

## 2. Uploaded photos can be overwritten or deleted by anyone

The `sneaker-images` storage bucket is public read, and the insert/update/delete policies are
scoped only to `bucket_id = 'sneaker-images'`, not to an owner. Size and MIME-type limits have
been applied, but any caller can still replace or remove another photo.

## What closes both

Add an email/password sign-in screen, add a `user_id uuid references auth.users` column to
`sneaker_items` (and derive ownership on the child tables through `item_id`), then replace the
`true` predicates with `auth.uid() = user_id` and scope the storage policies to a per-user path
prefix. Until then, treat the app URL and API key as a shared secret and do not publish them.
