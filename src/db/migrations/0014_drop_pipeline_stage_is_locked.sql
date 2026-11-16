-- Locked ("Manager only") stages are gone; CTS Signed and Loan Processing were the only ones.
ALTER TABLE "pipeline_stages" DROP COLUMN IF EXISTS "is_locked";
