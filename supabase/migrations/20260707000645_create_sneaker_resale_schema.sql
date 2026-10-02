/*
# Sneaker Resale Listing Agent — Full Schema

## Overview
Single-tenant schema (no auth required) for a sneaker resale operations dashboard.
All tables use anon+authenticated RLS policies so the frontend anon-key client can read/write freely.

## New Tables

### sneaker_items
Core inventory record for every sneaker being processed/sold.
- id: uuid PK
- item_id: human-readable sequential ID like N-001
- item_number: integer sequence (auto-increment via trigger)
- status: draft | needs_photos | needs_review | ready_to_list | listed | sold | delisted
- brand, model, nickname (colorway), style_code, upc
- size, gender, category
- condition_grade: new_with_box | new_without_box | pre_owned_excellent | pre_owned_good | pre_owned_fair | damaged_flawed
- list_price, accept_offer_floor, do_not_sell_below, local_cash_price
- notes, created_at, updated_at

### sneaker_images
Photos attached to a sneaker item stored in Supabase Storage.
- id, item_id FK, storage_path, public_url
- label: hero | side | back | outsole | size_tag | box_label | flaw | insole | other
- sort_order, created_at

### ai_identification
Result from the AI vision identification agent.
- id, item_id FK (unique — one result per item)
- brand, model, nickname, style_code, upc, size, gender, category
- production_dates, materials, box_details (jsonb)
- confidence_score (0-100)
- missing_info (text[])
- raw_response (jsonb)
- verified (boolean — set true after verification agent passes)
- verification_sources (jsonb)
- created_at, updated_at

### condition_assessment
Result from the AI condition agent.
- id, item_id FK (unique)
- grade: matches sneaker_items condition options
- outsole_wear, heel_drag, toe_box_creasing, scuffs, stains, yellowing
- missing_insoles, lace_condition, box_condition, sole_separation, odor_risk (all boolean/text)
- detailed_notes, photo_feedback (text[])
- raw_response (jsonb)
- created_at

### comp_research
Pricing research data from eBay + resale sources.
- id, item_id FK (unique)
- active_listings (jsonb array — {title, price, url, condition, date})
- sold_listings (jsonb array)
- fast_sale_price, recommended_price, accept_offer_floor, local_cash_price, do_not_sell_below
- expected_sell_days
- sources (jsonb)
- raw_response (jsonb)
- created_at, updated_at

### listing_content
AI-generated listing copy for all platforms.
- id, item_id FK (unique)
- ebay_title, facebook_title, mercari_title, offerup_title (text)
- ebay_description, facebook_description, mercari_description, offerup_description (text)
- item_specifics (jsonb)
- keyword_bank (text[])
- hashtags (text[])
- photo_feedback (text[])
- platform_strategy (text)
- raw_response (jsonb)
- created_at, updated_at

### platform_listings
Tracks per-platform listing status and URLs for non-eBay platforms.
- id, item_id FK, platform (facebook | mercari | offerup | poshmark | ebay)
- status: not_started | drafted | listed | sold | removed
- listing_url (text, nullable)
- ebay_listing_id, ebay_offer_id (nullable, for eBay)
- notes, listed_at, sold_at, created_at, updated_at

## Security
- RLS enabled on all tables
- Policies: anon + authenticated can SELECT/INSERT/UPDATE/DELETE (single-tenant app, no login)
*/

-- ============================================================
-- SEQUENCE for human-readable item IDs
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS sneaker_item_number_seq START 1;

-- ============================================================
-- sneaker_items
-- ============================================================
CREATE TABLE IF NOT EXISTS sneaker_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number integer NOT NULL DEFAULT nextval('sneaker_item_number_seq'),
  item_id text UNIQUE GENERATED ALWAYS AS ('N-' || lpad(item_number::text, 3, '0')) STORED,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_photos','needs_review','ready_to_list','listed','sold','delisted')),
  brand text,
  model text,
  nickname text,
  style_code text,
  upc text,
  size text,
  gender text,
  category text,
  condition_grade text CHECK (condition_grade IN ('new_with_box','new_without_box','pre_owned_excellent','pre_owned_good','pre_owned_fair','damaged_flawed')),
  list_price numeric(10,2),
  accept_offer_floor numeric(10,2),
  do_not_sell_below numeric(10,2),
  local_cash_price numeric(10,2),
  notes text,
  hero_image_url text,
  ebay_listing_id text,
  ebay_listing_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sneaker_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_items" ON sneaker_items;
CREATE POLICY "anon_select_items" ON sneaker_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_items" ON sneaker_items;
CREATE POLICY "anon_insert_items" ON sneaker_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_items" ON sneaker_items;
CREATE POLICY "anon_update_items" ON sneaker_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_items" ON sneaker_items;
CREATE POLICY "anon_delete_items" ON sneaker_items FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- sneaker_images
-- ============================================================
CREATE TABLE IF NOT EXISTS sneaker_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES sneaker_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  label text NOT NULL DEFAULT 'other' CHECK (label IN ('hero','side','back','outsole','size_tag','box_label','flaw','insole','other')),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sneaker_images_item_id ON sneaker_images(item_id);
ALTER TABLE sneaker_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_images" ON sneaker_images;
CREATE POLICY "anon_select_images" ON sneaker_images FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_images" ON sneaker_images;
CREATE POLICY "anon_insert_images" ON sneaker_images FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_images" ON sneaker_images;
CREATE POLICY "anon_update_images" ON sneaker_images FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_images" ON sneaker_images;
CREATE POLICY "anon_delete_images" ON sneaker_images FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- ai_identification
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_identification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES sneaker_items(id) ON DELETE CASCADE,
  brand text,
  model text,
  nickname text,
  style_code text,
  upc text,
  size text,
  gender text,
  category text,
  production_dates text,
  materials text,
  box_details jsonb DEFAULT '{}',
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  missing_info text[] DEFAULT '{}',
  raw_response jsonb DEFAULT '{}',
  verified boolean DEFAULT false,
  verification_sources jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_identification_item_id ON ai_identification(item_id);
ALTER TABLE ai_identification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ai_id" ON ai_identification;
CREATE POLICY "anon_select_ai_id" ON ai_identification FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ai_id" ON ai_identification;
CREATE POLICY "anon_insert_ai_id" ON ai_identification FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ai_id" ON ai_identification;
CREATE POLICY "anon_update_ai_id" ON ai_identification FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ai_id" ON ai_identification;
CREATE POLICY "anon_delete_ai_id" ON ai_identification FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- condition_assessment
-- ============================================================
CREATE TABLE IF NOT EXISTS condition_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES sneaker_items(id) ON DELETE CASCADE,
  grade text CHECK (grade IN ('new_with_box','new_without_box','pre_owned_excellent','pre_owned_good','pre_owned_fair','damaged_flawed')),
  outsole_wear text,
  heel_drag text,
  toe_box_creasing text,
  scuffs text,
  stains text,
  yellowing text,
  missing_insoles boolean DEFAULT false,
  lace_condition text,
  box_condition text,
  sole_separation boolean DEFAULT false,
  odor_risk boolean DEFAULT false,
  detailed_notes text,
  photo_feedback text[] DEFAULT '{}',
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_condition_item_id ON condition_assessment(item_id);
ALTER TABLE condition_assessment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_condition" ON condition_assessment;
CREATE POLICY "anon_select_condition" ON condition_assessment FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_condition" ON condition_assessment;
CREATE POLICY "anon_insert_condition" ON condition_assessment FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_condition" ON condition_assessment;
CREATE POLICY "anon_update_condition" ON condition_assessment FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_condition" ON condition_assessment;
CREATE POLICY "anon_delete_condition" ON condition_assessment FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- comp_research
-- ============================================================
CREATE TABLE IF NOT EXISTS comp_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES sneaker_items(id) ON DELETE CASCADE,
  active_listings jsonb DEFAULT '[]',
  sold_listings jsonb DEFAULT '[]',
  fast_sale_price numeric(10,2),
  recommended_price numeric(10,2),
  accept_offer_floor numeric(10,2),
  local_cash_price numeric(10,2),
  do_not_sell_below numeric(10,2),
  expected_sell_days integer,
  sources jsonb DEFAULT '[]',
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_research_item_id ON comp_research(item_id);
ALTER TABLE comp_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_comps" ON comp_research;
CREATE POLICY "anon_select_comps" ON comp_research FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_comps" ON comp_research;
CREATE POLICY "anon_insert_comps" ON comp_research FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_comps" ON comp_research;
CREATE POLICY "anon_update_comps" ON comp_research FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_comps" ON comp_research;
CREATE POLICY "anon_delete_comps" ON comp_research FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- listing_content
-- ============================================================
CREATE TABLE IF NOT EXISTS listing_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL UNIQUE REFERENCES sneaker_items(id) ON DELETE CASCADE,
  ebay_title text,
  facebook_title text,
  mercari_title text,
  offerup_title text,
  ebay_description text,
  facebook_description text,
  mercari_description text,
  offerup_description text,
  item_specifics jsonb DEFAULT '{}',
  keyword_bank text[] DEFAULT '{}',
  hashtags text[] DEFAULT '{}',
  photo_feedback text[] DEFAULT '{}',
  platform_strategy text,
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_content_item_id ON listing_content(item_id);
ALTER TABLE listing_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_listing" ON listing_content;
CREATE POLICY "anon_select_listing" ON listing_content FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_listing" ON listing_content;
CREATE POLICY "anon_insert_listing" ON listing_content FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_listing" ON listing_content;
CREATE POLICY "anon_update_listing" ON listing_content FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_listing" ON listing_content;
CREATE POLICY "anon_delete_listing" ON listing_content FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- platform_listings
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES sneaker_items(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ebay','facebook','mercari','offerup','poshmark')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','drafted','listed','sold','removed')),
  listing_url text,
  ebay_listing_id text,
  ebay_offer_id text,
  notes text,
  listed_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (item_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_listings_item_id ON platform_listings(item_id);
ALTER TABLE platform_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_platform" ON platform_listings;
CREATE POLICY "anon_select_platform" ON platform_listings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_platform" ON platform_listings;
CREATE POLICY "anon_insert_platform" ON platform_listings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_platform" ON platform_listings;
CREATE POLICY "anon_update_platform" ON platform_listings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_platform" ON platform_listings;
CREATE POLICY "anon_delete_platform" ON platform_listings FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_sneaker_items_updated_at ON sneaker_items;
CREATE TRIGGER update_sneaker_items_updated_at
  BEFORE UPDATE ON sneaker_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_identification_updated_at ON ai_identification;
CREATE TRIGGER update_ai_identification_updated_at
  BEFORE UPDATE ON ai_identification
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comp_research_updated_at ON comp_research;
CREATE TRIGGER update_comp_research_updated_at
  BEFORE UPDATE ON comp_research
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_listing_content_updated_at ON listing_content;
CREATE TRIGGER update_listing_content_updated_at
  BEFORE UPDATE ON listing_content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_listings_updated_at ON platform_listings;
CREATE TRIGGER update_platform_listings_updated_at
  BEFORE UPDATE ON platform_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
