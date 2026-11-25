-- Floors can be grouped under a name and colour (e.g. Tower A, teal), shown on each unit.
-- Replaces the odd and even side names; those columns are no longer read.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "floor_groups" jsonb DEFAULT '[]'::jsonb NOT NULL;
