-- Billing: one bill per opportunity (unit price plus miscellaneous fee), paid down by payments.
CREATE TABLE IF NOT EXISTS "bills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE CASCADE,
  "broker_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "unit_label" varchar(220) NOT NULL,
  "unit_price" numeric(18, 2) NOT NULL,
  "miscellaneous_fee" numeric(18, 2) DEFAULT '0' NOT NULL,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "bills_deal_id_unique" UNIQUE("deal_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_org_broker_user_id_idx" ON "bills" ("organization_id", "broker_user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "bill_id" uuid NOT NULL REFERENCES "bills"("id") ON DELETE RESTRICT,
  "amount" numeric(18, 2) NOT NULL,
  "paid_on" date NOT NULL,
  "method" varchar(20) NOT NULL,
  "reference_no" varchar(120),
  "notes" text,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_bill_id_idx" ON "payments" ("bill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_org_paid_on_idx" ON "payments" ("organization_id", "paid_on");
