-- Settings -> Commissions: a role placed under another, and the split each won opportunity earns.
CREATE TABLE IF NOT EXISTS "commission_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE cascade,
	"parent_role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE cascade,
	"seller_rate" numeric(5, 2) NOT NULL,
	"parent_rate" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_links_role_id_parent_role_id_unique" UNIQUE("role_id","parent_role_id")
);
CREATE TABLE IF NOT EXISTS "deal_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
	"deal_id" uuid NOT NULL REFERENCES "deals"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"role_name" varchar(100) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"base_amount" numeric(18, 2) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_commissions_deal_id_user_id_unique" UNIQUE("deal_id","user_id")
);
CREATE INDEX IF NOT EXISTS "deal_commissions_org_user_idx" ON "deal_commissions" ("organization_id","user_id");
