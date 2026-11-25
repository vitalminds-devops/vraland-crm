-- Prices now live on unit types, parking types and slots; the property-wide amounts are no longer
-- edited. Copy them down once to whatever has none of its own, so nothing loses its price.
UPDATE "unit_types" ut SET "reservation_fee" = p."reservation_fee"
  FROM "properties" p
  WHERE ut."property_id" = p."id" AND ut."reservation_fee" IS NULL AND p."reservation_fee" IS NOT NULL;
UPDATE "unit_types" ut SET "monthly_amortization" = p."monthly_rent"
  FROM "properties" p
  WHERE ut."property_id" = p."id" AND ut."monthly_amortization" IS NULL AND p."monthly_rent" IS NOT NULL;
UPDATE "parking_slots" s SET "price" = p."parking_price"
  FROM "properties" p
  WHERE s."building_id" = p."id" AND s."price" IS NULL AND p."parking_price" IS NOT NULL;
UPDATE "parking_slots" s SET "reservation_fee" = p."parking_reservation_fee"
  FROM "properties" p
  WHERE s."building_id" = p."id" AND s."reservation_fee" IS NULL AND p."parking_reservation_fee" IS NOT NULL;
