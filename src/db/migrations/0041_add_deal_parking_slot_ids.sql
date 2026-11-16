ALTER TABLE deals ADD COLUMN IF NOT EXISTS parking_slot_ids uuid[] NOT NULL DEFAULT '{}';
