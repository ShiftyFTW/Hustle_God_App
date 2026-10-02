/*
# Remove all auth.users references from RLS policies

## Problem
Every owner-scoped RLS policy on every table (and storage policies)
contained a subquery: `(SELECT id FROM auth.users ORDER BY created_at LIMIT 1)`
to implement "legacy NULL user_id rows belong to the first registered user."

The `authenticated` role does NOT have SELECT permission on auth.users,
so every policy evaluation hit `permission denied for table users` (42501),
blocking all inserts and queries.

## Fix
1. Backfill all NULL user_id rows on every table with the first auth user's ID
   using a SECURITY DEFINER function (which runs as the owner and CAN read
   auth.users). The function is dropped immediately after backfill.
2. Make user_id NOT NULL DEFAULT auth.uid() on all 7 tables.
3. Rewrite every policy to use `auth.uid() = user_id` ONLY — no auth.users
   subquery, no NULL fallback. Since all rows are now backfilled, there are
   no NULL user_id rows to worry about.
4. Rewrite storage policies the same way — no auth.users subquery.
5. Do NOT grant SELECT on auth.users to authenticated.

## Tables affected
sneaker_items, sneaker_images, ai_identification, condition_assessment,
comp_research, listing_content, platform_listings

## Security
- All policies now use auth.uid() = user_id directly
- user_id is NOT NULL DEFAULT auth.uid() so inserts auto-stamp ownership
- No auth.users access from any policy
*/

-- ============================================================
-- Step 1: Backfill NULL user_id rows using a SECURITY DEFINER function
-- ============================================================
CREATE OR REPLACE FUNCTION public._backfill_user_ids()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  first_user uuid;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE sneaker_items        SET user_id = first_user WHERE user_id IS NULL;
    UPDATE sneaker_images       SET user_id = first_user WHERE user_id IS NULL;
    UPDATE ai_identification    SET user_id = first_user WHERE user_id IS NULL;
    UPDATE condition_assessment SET user_id = first_user WHERE user_id IS NULL;
    UPDATE comp_research        SET user_id = first_user WHERE user_id IS NULL;
    UPDATE listing_content      SET user_id = first_user WHERE user_id IS NULL;
    UPDATE platform_listings    SET user_id = first_user WHERE user_id IS NULL;
  END IF;
END;
$$;

SELECT public._backfill_user_ids();
DROP FUNCTION public._backfill_user_ids();

-- ============================================================
-- Step 2: Make user_id NOT NULL DEFAULT auth.uid() on all tables
-- ============================================================
ALTER TABLE sneaker_items ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE sneaker_items ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE sneaker_images ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE sneaker_images ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE ai_identification ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE ai_identification ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE condition_assessment ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE condition_assessment ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE comp_research ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE comp_research ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE listing_content ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE listing_content ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE platform_listings ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE platform_listings ALTER COLUMN user_id SET NOT NULL;

-- ============================================================
-- Step 3: Rewrite all RLS policies — auth.uid() = user_id only
-- ============================================================

-- sneaker_items
DROP POLICY IF EXISTS "owner_select_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_insert_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_update_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_delete_items" ON sneaker_items;

CREATE POLICY "owner_select_items" ON sneaker_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_items" ON sneaker_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_items" ON sneaker_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_items" ON sneaker_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- sneaker_images
DROP POLICY IF EXISTS "owner_select_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_insert_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_update_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_delete_images" ON sneaker_images;

CREATE POLICY "owner_select_images" ON sneaker_images
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_images" ON sneaker_images
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_images" ON sneaker_images
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_images" ON sneaker_images
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ai_identification
DROP POLICY IF EXISTS "owner_select_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_insert_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_update_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_delete_ai_id" ON ai_identification;

CREATE POLICY "owner_select_ai_id" ON ai_identification
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_ai_id" ON ai_identification
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_ai_id" ON ai_identification
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_ai_id" ON ai_identification
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- condition_assessment
DROP POLICY IF EXISTS "owner_select_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_insert_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_update_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_delete_condition" ON condition_assessment;

CREATE POLICY "owner_select_condition" ON condition_assessment
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_condition" ON condition_assessment
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_condition" ON condition_assessment
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_condition" ON condition_assessment
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comp_research
DROP POLICY IF EXISTS "owner_select_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_insert_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_update_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_delete_comps" ON comp_research;

CREATE POLICY "owner_select_comps" ON comp_research
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_comps" ON comp_research
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_comps" ON comp_research
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_comps" ON comp_research
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- listing_content
DROP POLICY IF EXISTS "owner_select_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_insert_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_update_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_delete_listing" ON listing_content;

CREATE POLICY "owner_select_listing" ON listing_content
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_listing" ON listing_content
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_listing" ON listing_content
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_listing" ON listing_content
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- platform_listings
DROP POLICY IF EXISTS "owner_select_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_insert_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_update_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_delete_platform" ON platform_listings;

CREATE POLICY "owner_select_platform" ON platform_listings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert_platform" ON platform_listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_platform" ON platform_listings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_platform" ON platform_listings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Step 4: Rewrite storage policies — no auth.users subquery
-- ============================================================
DROP POLICY IF EXISTS "owner_read_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "owner_insert_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "owner_update_sneaker_images" ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_sneaker_images" ON storage.objects;

CREATE POLICY "owner_read_sneaker_images" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND sneaker_images.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_sneaker_images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_items
      WHERE sneaker_items.id::text = split_part((storage.objects.name)::text, '/', 1)
      AND sneaker_items.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_sneaker_images" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND sneaker_images.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND sneaker_images.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_delete_sneaker_images" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'sneaker-images'
    AND EXISTS (
      SELECT 1 FROM sneaker_images
      WHERE sneaker_images.storage_path = (storage.objects.name)::text
      AND sneaker_images.user_id = auth.uid()
    )
  );
