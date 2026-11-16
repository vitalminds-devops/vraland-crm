-- Personal details from the client information sheet. Age is worked out from birth_date, not stored.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "birth_date" date;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "gender" varchar(20);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "civil_status" varchar(20);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "citizenship" varchar(80);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "landline" varchar(50);
