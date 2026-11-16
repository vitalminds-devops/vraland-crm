/**
 * Common constants used across the properties feature.
 */

/**
 * Available property statuses.
 */
export const propertyStatuses = [
  "draft",
  "active",
  "reserved",
  "pending",
  "under_contract",
  "sold",
  "rented",
  "withdrawn",
  "inactive",
] as const;

/**
 * Available property types.
 */
export const propertyTypes = [
  "lot",
  "house_and_lot",
  "condominium",
  "townhouse",
  "commercial",
  "office",
  "warehouse",
  "farm",
  "other",
] as const;

export const propertyTransactionTypes = ["sale", "rent", "lease"] as const;

export const cardClass =
  "rounded-xl border border-border/50 bg-card p-5 shadow-xs dark:shadow-none";

/**
 * Standard section header styling.
 */
export const headClass = "border-b border-border/60 pb-3 text-[16px] font-semibold leading-none";

/**
 * Standard input field styling.
 */
export const fieldClass =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";
