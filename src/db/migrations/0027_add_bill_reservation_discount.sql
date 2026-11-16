-- A bill's total is now unit price - reservation discount + miscellaneous fee.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "reservation_discount" numeric(18, 2) DEFAULT '0' NOT NULL;
