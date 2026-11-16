-- "Closed - Won" and "CTS Signed" become one won stage, "CTS Signed - Won" (slug stays closed-won).
UPDATE "pipeline_stages" SET "name" = 'CTS Signed - Won', "updated_at" = now()
WHERE "slug" = 'closed-won';--> statement-breakpoint

-- Deals in CTS Signed join the won stage; anything still open there is now won.
UPDATE "deals" d SET
  "stage_id" = won."id",
  "status" = 'won',
  "actual_close_date" = COALESCE(d."actual_close_date", current_date),
  "updated_at" = now()
FROM "pipeline_stages" cts
JOIN "pipeline_stages" won
  ON won."organization_id" = cts."organization_id" AND won."slug" = 'closed-won'
WHERE d."stage_id" = cts."id" AND cts."slug" = 'cts-signed';--> statement-breakpoint

UPDATE "deal_stage_change_requests" r SET "status" = 'rejected', "decided_at" = now(), "updated_at" = now()
FROM "pipeline_stages" s
WHERE r."to_stage_id" = s."id" AND r."status" = 'pending' AND s."slug" = 'cts-signed';--> statement-breakpoint

-- Deactivated, not deleted: deal history references it without a cascade.
UPDATE "pipeline_stages" SET "is_active" = false, "updated_at" = now()
WHERE "slug" = 'cts-signed';--> statement-breakpoint

-- Renumber active stages without gaps (forward moves may skip only one position).
UPDATE "pipeline_stages" SET "position" = "position" + 1000;--> statement-breakpoint
UPDATE "pipeline_stages" p SET "position" = ranked."rn"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "position") AS "rn"
  FROM "pipeline_stages"
  WHERE "is_active"
) ranked
WHERE p."id" = ranked."id";
