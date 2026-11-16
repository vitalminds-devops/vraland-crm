-- Split "Opportunity & Reservation" into Opportunity and Reservation (placed right after it).
-- Deals with a Reservation (or Full) payment move to Reservation. Runs once per organization:
-- only where the stage still carries the merged name.
DO $$
DECLARE
  opp record;
  res_id uuid;
BEGIN
  FOR opp IN
    SELECT id, organization_id, position FROM pipeline_stages
    WHERE slug = 'opportunity' AND name = 'Opportunity & Reservation'
  LOOP
    UPDATE pipeline_stages SET name = 'Opportunity', updated_at = now() WHERE id = opp.id;

    SELECT id INTO res_id FROM pipeline_stages
    WHERE organization_id = opp.organization_id AND slug = 'reservation';

    -- Positions are unique per organization: park everything after Opportunity, place
    -- Reservation in the freed slot, then bring the rest back one step later.
    UPDATE pipeline_stages SET position = -position
    WHERE organization_id = opp.organization_id AND position > opp.position;

    IF res_id IS NULL THEN
      INSERT INTO pipeline_stages (organization_id, name, slug, position, default_probability)
      VALUES (opp.organization_id, 'Reservation', 'reservation', opp.position + 1, 60)
      RETURNING id INTO res_id;
    ELSE
      UPDATE pipeline_stages
      SET name = 'Reservation', position = opp.position + 1, is_active = true, updated_at = now()
      WHERE id = res_id;
    END IF;

    UPDATE pipeline_stages SET position = -position + 1
    WHERE organization_id = opp.organization_id AND position < 0;

    WITH moved AS (
      UPDATE deals d
      SET stage_id = res_id,
          probability = (SELECT default_probability FROM pipeline_stages WHERE id = res_id),
          updated_at = now()
      WHERE d.stage_id = opp.id
        AND EXISTS (
          SELECT 1 FROM bills b
          JOIN payments p ON p.bill_id = b.id
          WHERE b.deal_id = d.id
            AND p.deleted_at IS NULL
            AND p.classification IN ('reservation', 'full_payment')
        )
      RETURNING d.id
    )
    INSERT INTO deal_stage_history (deal_id, from_stage_id, to_stage_id, note)
    SELECT id, opp.id, res_id, 'Moved to Reservation: reservation paid.' FROM moved;
  END LOOP;
END $$;
