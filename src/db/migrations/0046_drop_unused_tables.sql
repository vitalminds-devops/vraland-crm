-- Tables the app never used. Each is dropped only while empty, so no data is lost; a table that
-- holds rows stays for someone to look at. Re-runnable.
DO $$
DECLARE
  t text;
  has_rows boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'template_id'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM documents WHERE template_id IS NOT NULL)' INTO has_rows;
    IF NOT has_rows THEN
      ALTER TABLE documents DROP COLUMN template_id;
    END IF;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'contact_category_assignments',
    'contact_field_archive',
    'document_templates',
    'notifications',
    'property_owners'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO has_rows;
      IF NOT has_rows THEN
        EXECUTE format('DROP TABLE %I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
