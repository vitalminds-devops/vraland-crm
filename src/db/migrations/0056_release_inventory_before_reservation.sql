-- A selection or payment alone does not hold inventory before the Reservation stage.
WITH early_deals AS (
  SELECT d.id FROM deals d
  JOIN pipeline_stages s ON s.id = d.stage_id
  WHERE s.slug IN ('leads', 'opportunity') AND NOT s.is_won_stage
)
UPDATE units
SET status = 'available', reserved_deal_id = NULL, updated_at = now()
WHERE status IN ('deposit_paid', 'sold') AND reserved_deal_id IN (SELECT id FROM early_deals);

WITH early_deals AS (
  SELECT d.id FROM deals d
  JOIN pipeline_stages s ON s.id = d.stage_id
  WHERE s.slug IN ('leads', 'opportunity') AND NOT s.is_won_stage
)
UPDATE parking_slots
SET status = 'available', reserved_deal_id = NULL, updated_at = now()
WHERE status IN ('deposit_paid', 'sold') AND reserved_deal_id IN (SELECT id FROM early_deals);
