-- Brokers move one lane at a time, measured by position. A stage retired without renumbering (the old
-- "Reservation" at 3) left Won at 4 after Opportunity at 2, so no broker could ever reach Won.
-- Active stages become 1..n in their current order; retired ones park from 1001. Only organizations with
-- a gap are touched, so this is a no-op once they are numbered. Parked below -10000 first because
-- (organization_id, position) is unique and checked row by row.
WITH gapped AS (
  SELECT organization_id
  FROM (
    SELECT organization_id, position,
           row_number() OVER (PARTITION BY organization_id ORDER BY position) AS rn
    FROM pipeline_stages
    WHERE is_active
  ) active
  GROUP BY organization_id
  HAVING bool_or(position <> rn)
)
UPDATE pipeline_stages p
SET position = -10000 - ranked.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY position) AS rn
  FROM pipeline_stages
  WHERE organization_id IN (SELECT organization_id FROM gapped)
) ranked
WHERE p.id = ranked.id;--> statement-breakpoint

-- Parked rows are exactly the ones above; order by the parked value, which kept the old order.
UPDATE pipeline_stages p
SET position = CASE WHEN p.is_active THEN ranked.rn ELSE 1000 + ranked.rn END,
    updated_at = now()
FROM (
  SELECT id, row_number() OVER (PARTITION BY organization_id, is_active ORDER BY position DESC) AS rn
  FROM pipeline_stages
  WHERE position <= -10000
) ranked
WHERE p.id = ranked.id;
