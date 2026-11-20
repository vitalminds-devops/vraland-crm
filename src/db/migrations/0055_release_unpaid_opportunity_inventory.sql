-- Release reservations created by stage changes alone; preserve paid and won inventory.
WITH unpaid_deals AS (
  SELECT d.id
  FROM deals d
  JOIN pipeline_stages s ON s.id = d.stage_id
  WHERE NOT s.is_won_stage
    AND NOT EXISTS (
      SELECT 1 FROM bills b JOIN payments p ON p.bill_id = b.id
      WHERE b.deal_id = d.id AND p.deleted_at IS NULL AND p.amount > 0
    )
)
UPDATE units
SET status = 'available', reserved_deal_id = NULL, updated_at = now()
WHERE status = 'deposit_paid' AND reserved_deal_id IN (SELECT id FROM unpaid_deals);

WITH unpaid_deals AS (
  SELECT d.id
  FROM deals d
  JOIN pipeline_stages s ON s.id = d.stage_id
  WHERE NOT s.is_won_stage
    AND NOT EXISTS (
      SELECT 1 FROM bills b JOIN payments p ON p.bill_id = b.id
      WHERE b.deal_id = d.id AND p.deleted_at IS NULL AND p.amount > 0
    )
)
UPDATE parking_slots
SET status = 'available', reserved_deal_id = NULL, updated_at = now()
WHERE status = 'deposit_paid' AND reserved_deal_id IN (SELECT id FROM unpaid_deals);
