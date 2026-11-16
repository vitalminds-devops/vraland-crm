-- Retire the "Deposit Paid" and "Loan Processing" stages. They are deactivated, not deleted,
-- because deal history and stage-change requests reference them without a cascade.

-- Deals sitting in a retired stage move back to the stage before it.
UPDATE "deals" d SET "stage_id" = s_new."id", "updated_at" = now()
FROM "pipeline_stages" s_old
JOIN "pipeline_stages" s_new
  ON s_new."organization_id" = s_old."organization_id"
 AND s_new."slug" = CASE s_old."slug" WHEN 'deposit-paid' THEN 'reservation' ELSE 'cts-signed' END
WHERE d."stage_id" = s_old."id"
  AND s_old."slug" IN ('deposit-paid', 'loan-processing');--> statement-breakpoint

-- Pending requests to move into a retired stage can no longer be approved.
UPDATE "deal_stage_change_requests" r SET "status" = 'rejected', "decided_at" = now(), "updated_at" = now()
FROM "pipeline_stages" s
WHERE r."to_stage_id" = s."id"
  AND r."status" = 'pending'
  AND s."slug" IN ('deposit-paid', 'loan-processing');--> statement-breakpoint

UPDATE "pipeline_stages" SET "is_active" = false, "updated_at" = now()
WHERE "slug" IN ('deposit-paid', 'loan-processing');--> statement-breakpoint

-- Forward moves may skip only one position, so active stages must be numbered without gaps.
-- Shift everything out of the way first; inactive stages stay parked above 1000.
UPDATE "pipeline_stages" SET "position" = "position" + 1000;--> statement-breakpoint
UPDATE "pipeline_stages" p SET "position" = ranked."rn"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "position") AS "rn"
  FROM "pipeline_stages"
  WHERE "is_active"
) ranked
WHERE p."id" = ranked."id";
