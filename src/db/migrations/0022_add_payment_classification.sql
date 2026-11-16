-- Payments are classified: a reservation moves a lead to Opportunity, the first monthly moves it to Won.
-- Payments recorded before classifications existed are what unlocked Opportunity, so they become
-- reservations, but only when this migration adds the column; if db:push added it first, rows already
-- classified by people are left alone.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'classification'
  ) THEN
    ALTER TABLE "payments" ADD COLUMN "classification" varchar(20) DEFAULT 'downpayment' NOT NULL;
    UPDATE "payments" SET "classification" = 'reservation';
  END IF;
END $$;
