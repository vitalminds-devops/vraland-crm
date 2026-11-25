-- Prices now live on units (or their type). Units with neither take their property's old gross list price.
UPDATE "units" AS u
SET "price" = p."asking_price"
FROM "properties" AS p
WHERE u."building_id" = p."id"
  AND u."price" IS NULL
  AND p."asking_price" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "unit_types" AS t WHERE t."id" = u."unit_type_id" AND t."price" IS NOT NULL
  );
