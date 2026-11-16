ALTER TABLE deals ADD COLUMN IF NOT EXISTS unit_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE units ADD COLUMN IF NOT EXISTS reserved_deal_id uuid REFERENCES deals(id) ON DELETE RESTRICT;
ALTER TABLE parking_slots ADD COLUMN IF NOT EXISTS reserved_deal_id uuid REFERENCES deals(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS units_reserved_deal_id_idx ON units(reserved_deal_id);
CREATE INDEX IF NOT EXISTS parking_slots_reserved_deal_id_idx ON parking_slots(reserved_deal_id);
