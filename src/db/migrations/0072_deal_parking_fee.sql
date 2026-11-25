-- An opportunity keeps the parking part of its quoted reservation fee, so the unit and parking
-- reservation fees can be shown apart. The total stays in "reservation_fee".
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "parking_reservation_fee" numeric(18, 2);

-- Today's slot fees for opportunities that have parking but no saved parking fee (safe to run again).
UPDATE "deals" d SET "parking_reservation_fee" = (
  SELECT sum(ps."reservation_fee") FROM "parking_slots" ps
  WHERE ps."id" = any(d."parking_slot_ids")
)
WHERE d."parking_reservation_fee" IS NULL AND cardinality(d."parking_slot_ids") > 0;
