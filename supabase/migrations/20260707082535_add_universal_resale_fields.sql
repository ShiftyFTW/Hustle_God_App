-- Add item_type and universal fields to sneaker_items
ALTER TABLE sneaker_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'general_unknown',
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS model_number text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS measurements text;

-- Add universal fields to ai_identification
ALTER TABLE ai_identification
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'general_unknown',
  ADD COLUMN IF NOT EXISTS category_confidence integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS model_number text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS measurements text,
  ADD COLUMN IF NOT EXISTS included_accessories text,
  ADD COLUMN IF NOT EXISTS missing_accessories text,
  ADD COLUMN IF NOT EXISTS visible_flaws text[],
  ADD COLUMN IF NOT EXISTS testing_status text,
  ADD COLUMN IF NOT EXISTS authenticity_notes text;

-- Add platform_strategy to listing_content if missing
ALTER TABLE listing_content
  ADD COLUMN IF NOT EXISTS platform_strategy text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb;
