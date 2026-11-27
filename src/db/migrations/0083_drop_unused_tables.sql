-- Drops tables nothing writes any more: offers, property media, e-sign signers and events, and
-- contact categories. A table that still holds rows is kept, so no old record is lost; it is no
-- longer shown anywhere. Safe to run again.
DO $$
DECLARE
  name text;
  has_rows boolean;
BEGIN
  -- esign_events first: it points at document_signers.
  FOREACH name IN ARRAY ARRAY['esign_events', 'document_signers', 'offers', 'property_media', 'contact_categories']
  LOOP
    IF to_regclass('public.' || name) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', name) INTO has_rows;
      IF has_rows THEN
        RAISE NOTICE 'Kept % because it has rows', name;
      ELSE
        BEGIN
          EXECUTE format('DROP TABLE %I', name);
        EXCEPTION WHEN dependent_objects_still_exist THEN
          -- A kept table (say esign_events with rows) still points at it.
          RAISE NOTICE 'Kept % because a kept table refers to it', name;
        END;
      END IF;
    END IF;
  END LOOP;
END $$;
