-- Each property chooses how its units are numbered when its floors are first set up:
-- letters (2A), numbers (201) or custom endings (201, 203 … 217), plus the floor levels it skips.
-- Null keeps the old behaviour: letters, with floor 4 skipped.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "unit_numbering" jsonb;
