-- Drops columns nothing ever filled: a property's own floor area, a development's map position,
-- an opportunity's financing type and agent split, a contact's last-contacted date, calendar and
-- e-sign provider ids, and the organization's street address. A column that holds any value is
-- kept, so nothing is lost. Safe to run again.
DO $$
DECLARE
  target text[];
  has_values boolean;
BEGIN
  FOREACH target SLICE 1 IN ARRAY ARRAY[
    ['properties', 'floor_area_sqm'],
    ['developments', 'latitude'],
    ['developments', 'longitude'],
    ['deals', 'financing_type'],
    ['deal_agents', 'commission_split_percent'],
    ['contacts', 'last_contacted_at'],
    ['calendar_events', 'external_calendar_provider'],
    ['calendar_events', 'external_event_id'],
    ['documents', 'esign_provider'],
    ['documents', 'external_envelope_id'],
    ['organizations', 'address_line1'],
    ['organizations', 'address_line2'],
    ['organizations', 'city'],
    ['organizations', 'province'],
    ['organizations', 'postal_code']
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = target[1] AND column_name = target[2]
    ) THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I IS NOT NULL)', target[1], target[2])
        INTO has_values;
      IF has_values THEN
        RAISE NOTICE 'Kept %.% because it has values', target[1], target[2];
      ELSE
        EXECUTE format('ALTER TABLE %I DROP COLUMN %I', target[1], target[2]);
      END IF;
    END IF;
  END LOOP;
END $$;
