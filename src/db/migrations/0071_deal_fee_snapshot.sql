-- An opportunity keeps the reservation fee and monthly amortization it was quoted when its units
-- and parking were chosen, so later unit type or slot edits leave open and won sales as they were.
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "monthly_amortization" numeric(18, 2);

-- Freeze the current amounts on opportunities that have none saved yet (safe to run again).
UPDATE "deals" d SET "reservation_fee" = fees.total
FROM (
  SELECT d2."id",
    CASE WHEN u.fee IS NULL AND s.fee IS NULL THEN NULL
      ELSE coalesce(u.fee, 0) + coalesce(s.fee, 0) END AS total
  FROM "deals" d2
  LEFT JOIN LATERAL (
    SELECT sum(ut."reservation_fee") AS fee FROM "units" un
    JOIN "unit_types" ut ON ut."id" = un."unit_type_id"
    WHERE un."id" = any(d2."unit_ids")
      OR (cardinality(d2."unit_ids") = 0 AND un."id" = d2."unit_id")
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT sum(ps."reservation_fee") AS fee FROM "parking_slots" ps
    WHERE ps."id" = any(d2."parking_slot_ids")
  ) s ON true
) fees
WHERE d."id" = fees."id" AND d."reservation_fee" IS NULL AND fees.total IS NOT NULL;

UPDATE "deals" d SET "monthly_amortization" = (
  SELECT sum(ut."monthly_amortization") FROM "units" un
  JOIN "unit_types" ut ON ut."id" = un."unit_type_id"
  WHERE un."id" = any(d."unit_ids")
    OR (cardinality(d."unit_ids") = 0 AND un."id" = d."unit_id")
)
WHERE d."monthly_amortization" IS NULL;
