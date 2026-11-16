-- 0042 added reserved_deal_id but left units already reserved or sold without an owner, which blocks
-- their payments and stage moves. Fill it only where exactly one live deal claims the unit; ambiguous
-- rows stay empty for a person to resolve. Re-runnable: only touches rows still missing an owner.
UPDATE units u SET reserved_deal_id = claim.deal_id
FROM (
  SELECT x.unit_id, (array_agg(x.deal_id))[1] AS deal_id
  FROM (
    SELECT DISTINCT d.id AS deal_id, unnest(array_append(d.unit_ids, d.unit_id)) AS unit_id
    FROM deals d
    WHERE d.deleted_at IS NULL AND d.status <> 'lost'
  ) x
  WHERE x.unit_id IS NOT NULL
  GROUP BY x.unit_id
  HAVING count(*) = 1
) claim
WHERE u.id = claim.unit_id AND u.reserved_deal_id IS NULL AND u.status IN ('deposit_paid', 'sold');

UPDATE parking_slots p SET reserved_deal_id = claim.deal_id
FROM (
  SELECT x.slot_id, (array_agg(x.deal_id))[1] AS deal_id
  FROM (
    SELECT DISTINCT d.id AS deal_id, unnest(d.parking_slot_ids) AS slot_id
    FROM deals d
    WHERE d.deleted_at IS NULL AND d.status <> 'lost'
  ) x
  GROUP BY x.slot_id
  HAVING count(*) = 1
) claim
WHERE p.id = claim.slot_id AND p.reserved_deal_id IS NULL AND p.status IN ('deposit_paid', 'sold');
