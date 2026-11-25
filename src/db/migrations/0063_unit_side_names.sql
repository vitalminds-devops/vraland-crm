-- A property may name the two sides of its units, e.g. odd numbers "Sunrise" and even "Sunset".
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "odd_side_name" varchar(40);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "even_side_name" varchar(40);
