-- Unit types: a kind of unit in a property with its size, bedrooms and price.
CREATE TABLE IF NOT EXISTS "unit_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "bedrooms" smallint,
  "floor_area" numeric(10, 2),
  "price" numeric(18, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "unit_types_property_id_name_unique" UNIQUE ("property_id", "name")
);

-- Floor plans: an uploaded picture with units traced over it, shared by floors with that layout.
CREATE TABLE IF NOT EXISTS "floor_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "image_storage_key" text NOT NULL,
  "image_mime_type" varchar(100) NOT NULL,
  "shapes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "floor_plans_property_idx" ON "floor_plans" ("property_id");

-- Each floor may use one plan; each unit may have a type and its own size and price.
ALTER TABLE "floors" ADD COLUMN IF NOT EXISTS "plan_id" uuid REFERENCES "floor_plans"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "floors_plan_idx" ON "floors" ("plan_id");

ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "unit_type_id" uuid REFERENCES "unit_types"("id") ON DELETE SET NULL;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "floor_area" numeric(10, 2);
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "price" numeric(18, 2);
CREATE INDEX IF NOT EXISTS "units_unit_type_idx" ON "units" ("unit_type_id");
