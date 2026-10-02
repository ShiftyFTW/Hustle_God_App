/*
# Add Google Drive import columns to sneaker_items

## Overview
Adds two new columns to support the "Import from Drive" feature:
- `inventory_number`: a normalized inventory code (e.g. "n070") parsed from
  Google Drive folder names. Indexed for dashboard search.
- `drive_folder_id`: the Google Drive folder ID the item was imported from.
  Unique per user so the same folder cannot be imported twice.

## Changes to sneaker_items
1. `inventory_number text` — nullable, indexed (non-unique so multiple
   users could theoretically share a number, though in practice each user
   has their own Drive).
2. `drive_folder_id text` — nullable, indexed.
3. A composite unique constraint on (user_id, drive_folder_id) so the same
   Drive folder can't be imported twice by the same user.

## Security
- No new RLS policies needed — the existing owner-scoped policies on
  sneaker_items already cover SELECT/INSERT/UPDATE/DELETE for these columns
  since they are regular columns on the same table.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sneaker_items' AND column_name = 'inventory_number'
  ) THEN
    ALTER TABLE sneaker_items ADD COLUMN inventory_number text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sneaker_items' AND column_name = 'drive_folder_id'
  ) THEN
    ALTER TABLE sneaker_items ADD COLUMN drive_folder_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sneaker_items_inventory_number ON sneaker_items(inventory_number);
CREATE INDEX IF NOT EXISTS idx_sneaker_items_drive_folder_id ON sneaker_items(drive_folder_id);

-- Unique per user: same Drive folder can't be imported twice by the same user
DROP INDEX IF EXISTS idx_sneaker_items_user_drive_folder;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sneaker_items_user_drive_folder
  ON sneaker_items(user_id, drive_folder_id)
  WHERE drive_folder_id IS NOT NULL;
