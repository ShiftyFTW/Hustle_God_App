/*
# Add admin authentication and owner-scoped RLS

## Overview
Converts the app from single-tenant no-auth to owner-scoped auth.
Every table gets a nullable user_id column (DEFAULT auth.uid()) so new
inserts from authenticated sessions auto-stamp ownership. Existing 12
rows get NULL user_id; policies treat NULL-owner rows as belonging to
the first registered auth user, so the admin who signs up first
automatically inherits all legacy data. No second backfill migration
needed.

## Changes per table
### sneaker_items, sneaker_images, ai_identification, condition_assessment,
### comp_research, listing_content, platform_listings
- Added user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE (nullable)
- DEFAULT auth.uid() so authenticated inserts auto-stamp
- Replaced 4 anon policies with 4 authenticated owner-scoped policies
- Policy predicate: auth.uid() = user_id OR (user_id IS NULL AND
  auth.uid() = first auth user) — legacy rows inherit to first admin
- Added user_id index on each table

## Security
- All policies now TO authenticated only — anon gets zero rows
- Owner check via auth.uid() = user_id, with legacy NULL fallback to
  first registered user
- Once the owner signs up and creates new items, all new rows get
  the correct user_id automatically
*/

-- Helper: the first registered user (used for legacy NULL-row ownership)
-- Inlined as: (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)

-- ============================================================
-- sneaker_items
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sneaker_items' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sneaker_items
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE sneaker_items ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_sneaker_items_user_id ON sneaker_items(user_id);

DROP POLICY IF EXISTS "anon_select_items" ON sneaker_items;
DROP POLICY IF EXISTS "anon_insert_items" ON sneaker_items;
DROP POLICY IF EXISTS "anon_update_items" ON sneaker_items;
DROP POLICY IF EXISTS "anon_delete_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_select_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_insert_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_update_items" ON sneaker_items;
DROP POLICY IF EXISTS "owner_delete_items" ON sneaker_items;

CREATE POLICY "owner_select_items" ON sneaker_items
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_items" ON sneaker_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_items" ON sneaker_items
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_delete_items" ON sneaker_items
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- sneaker_images
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sneaker_images' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE sneaker_images
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE sneaker_images ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_sneaker_images_user_id ON sneaker_images(user_id);

DROP POLICY IF EXISTS "anon_select_images" ON sneaker_images;
DROP POLICY IF EXISTS "anon_insert_images" ON sneaker_images;
DROP POLICY IF EXISTS "anon_update_images" ON sneaker_images;
DROP POLICY IF EXISTS "anon_delete_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_select_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_insert_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_update_images" ON sneaker_images;
DROP POLICY IF EXISTS "owner_delete_images" ON sneaker_images;

CREATE POLICY "owner_select_images" ON sneaker_images
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_images" ON sneaker_images
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_images" ON sneaker_images
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_images" ON sneaker_images
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- ai_identification
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_identification' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE ai_identification
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE ai_identification ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_ai_identification_user_id ON ai_identification(user_id);

DROP POLICY IF EXISTS "anon_select_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "anon_insert_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "anon_update_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "anon_delete_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_select_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_insert_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_update_ai_id" ON ai_identification;
DROP POLICY IF EXISTS "owner_delete_ai_id" ON ai_identification;

CREATE POLICY "owner_select_ai_id" ON ai_identification
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_ai_id" ON ai_identification
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_ai_id" ON ai_identification
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_ai_id" ON ai_identification
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- condition_assessment
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'condition_assessment' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE condition_assessment
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE condition_assessment ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_condition_assessment_user_id ON condition_assessment(user_id);

DROP POLICY IF EXISTS "anon_select_condition" ON condition_assessment;
DROP POLICY IF EXISTS "anon_insert_condition" ON condition_assessment;
DROP POLICY IF EXISTS "anon_update_condition" ON condition_assessment;
DROP POLICY IF EXISTS "anon_delete_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_select_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_insert_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_update_condition" ON condition_assessment;
DROP POLICY IF EXISTS "owner_delete_condition" ON condition_assessment;

CREATE POLICY "owner_select_condition" ON condition_assessment
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_condition" ON condition_assessment
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_condition" ON condition_assessment
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_condition" ON condition_assessment
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- comp_research
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comp_research' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE comp_research
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE comp_research ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_comp_research_user_id ON comp_research(user_id);

DROP POLICY IF EXISTS "anon_select_comps" ON comp_research;
DROP POLICY IF EXISTS "anon_insert_comps" ON comp_research;
DROP POLICY IF EXISTS "anon_update_comps" ON comp_research;
DROP POLICY IF EXISTS "anon_delete_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_select_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_insert_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_update_comps" ON comp_research;
DROP POLICY IF EXISTS "owner_delete_comps" ON comp_research;

CREATE POLICY "owner_select_comps" ON comp_research
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_comps" ON comp_research
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_comps" ON comp_research
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_comps" ON comp_research
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- listing_content
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'listing_content' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE listing_content
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE listing_content ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_listing_content_user_id ON listing_content(user_id);

DROP POLICY IF EXISTS "anon_select_listing" ON listing_content;
DROP POLICY IF EXISTS "anon_insert_listing" ON listing_content;
DROP POLICY IF EXISTS "anon_update_listing" ON listing_content;
DROP POLICY IF EXISTS "anon_delete_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_select_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_insert_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_update_listing" ON listing_content;
DROP POLICY IF EXISTS "owner_delete_listing" ON listing_content;

CREATE POLICY "owner_select_listing" ON listing_content
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_listing" ON listing_content
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_listing" ON listing_content
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_listing" ON listing_content
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );

-- ============================================================
-- platform_listings
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_listings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE platform_listings
      ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE platform_listings ALTER COLUMN user_id SET DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_platform_listings_user_id ON platform_listings(user_id);

DROP POLICY IF EXISTS "anon_select_platform" ON platform_listings;
DROP POLICY IF EXISTS "anon_insert_platform" ON platform_listings;
DROP POLICY IF EXISTS "anon_update_platform" ON platform_listings;
DROP POLICY IF EXISTS "anon_delete_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_select_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_insert_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_update_platform" ON platform_listings;
DROP POLICY IF EXISTS "owner_delete_platform" ON platform_listings;

CREATE POLICY "owner_select_platform" ON platform_listings
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );
CREATE POLICY "owner_insert_platform" ON platform_listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update_platform" ON platform_listings
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  ) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_platform" ON platform_listings
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR (user_id IS NULL AND auth.uid() = (SELECT id FROM auth.users ORDER BY created_at LIMIT 1))
  );