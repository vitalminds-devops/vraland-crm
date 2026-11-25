-- Short running-number codes: OPP-000123, CON-000045, PROP-0007, DEV-0003.
-- Each organization numbers each kind on its own; the counter holds the last number given out.
CREATE TABLE IF NOT EXISTS "code_counters" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "last_value" integer NOT NULL,
  PRIMARY KEY ("organization_id", "kind")
);

-- Renumber every code not yet in the new format, oldest first, after the highest new-format
-- number. Archived records are renumbered too, since codes are unique across all of them.
-- Re-running changes nothing: every code already matches.
WITH numbered AS (
  SELECT r."id",
    coalesce((
      SELECT max(substring(x."deal_code" from '^OPP-([0-9]+)$')::int)
      FROM "deals" x WHERE x."organization_id" = r."organization_id"
    ), 0) + row_number() OVER (PARTITION BY r."organization_id" ORDER BY r."created_at", r."id") AS n
  FROM "deals" r
  WHERE r."deal_code" !~ '^OPP-[0-9]+$'
)
UPDATE "deals" r
SET "deal_code" = 'OPP-' || lpad(n::text, greatest(6, length(n::text)), '0')
FROM numbered WHERE r."id" = numbered."id";

WITH numbered AS (
  SELECT r."id",
    coalesce((
      SELECT max(substring(x."contact_code" from '^CON-([0-9]+)$')::int)
      FROM "contacts" x WHERE x."organization_id" = r."organization_id"
    ), 0) + row_number() OVER (PARTITION BY r."organization_id" ORDER BY r."created_at", r."id") AS n
  FROM "contacts" r
  WHERE r."contact_code" !~ '^CON-[0-9]+$'
)
UPDATE "contacts" r
SET "contact_code" = 'CON-' || lpad(n::text, greatest(6, length(n::text)), '0')
FROM numbered WHERE r."id" = numbered."id";

WITH numbered AS (
  SELECT r."id",
    coalesce((
      SELECT max(substring(x."property_code" from '^PROP-([0-9]+)$')::int)
      FROM "properties" x WHERE x."organization_id" = r."organization_id"
    ), 0) + row_number() OVER (PARTITION BY r."organization_id" ORDER BY r."created_at", r."id") AS n
  FROM "properties" r
  WHERE r."property_code" !~ '^PROP-[0-9]+$'
)
UPDATE "properties" r
SET "property_code" = 'PROP-' || lpad(n::text, greatest(4, length(n::text)), '0')
FROM numbered WHERE r."id" = numbered."id";

WITH numbered AS (
  SELECT r."id",
    coalesce((
      SELECT max(substring(x."code" from '^DEV-([0-9]+)$')::int)
      FROM "developments" x WHERE x."organization_id" = r."organization_id"
    ), 0) + row_number() OVER (PARTITION BY r."organization_id" ORDER BY r."created_at", r."id") AS n
  FROM "developments" r
  WHERE r."code" !~ '^DEV-[0-9]+$'
)
UPDATE "developments" r
SET "code" = 'DEV-' || lpad(n::text, greatest(4, length(n::text)), '0')
FROM numbered WHERE r."id" = numbered."id";

-- Start each counter at the highest number now in use.
INSERT INTO "code_counters" ("organization_id", "kind", "last_value")
SELECT "organization_id", 'opportunity', max(substring("deal_code" from '^OPP-([0-9]+)$')::int)
FROM "deals" WHERE "deal_code" ~ '^OPP-[0-9]+$' GROUP BY "organization_id"
UNION ALL
SELECT "organization_id", 'contact', max(substring("contact_code" from '^CON-([0-9]+)$')::int)
FROM "contacts" WHERE "contact_code" ~ '^CON-[0-9]+$' GROUP BY "organization_id"
UNION ALL
SELECT "organization_id", 'property', max(substring("property_code" from '^PROP-([0-9]+)$')::int)
FROM "properties" WHERE "property_code" ~ '^PROP-[0-9]+$' GROUP BY "organization_id"
UNION ALL
SELECT "organization_id", 'development', max(substring("code" from '^DEV-([0-9]+)$')::int)
FROM "developments" WHERE "code" ~ '^DEV-[0-9]+$' GROUP BY "organization_id"
ON CONFLICT ("organization_id", "kind")
DO UPDATE SET "last_value" = greatest("code_counters"."last_value", excluded."last_value");
