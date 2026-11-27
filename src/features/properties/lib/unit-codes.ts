export const unitStatuses = ["available", "deposit_paid", "sold", "inactive"] as const;
export type UnitStatus = (typeof unitStatuses)[number];

/** Reserved or sold out: the unit or parking slot is no longer for sale. */
export const isHeld = (status: string | undefined) =>
  status === "deposit_paid" || status === "sold";

export const unitStatusLabels: Record<UnitStatus, string> = {
  available: "Available",
  deposit_paid: "Reserved",
  sold: "Sold out",
  inactive: "Inactive",
};

export const unitStatusLabel = (status: string): string =>
  unitStatusLabels[status as UnitStatus] ?? status;

export const unitStatusTone: Record<UnitStatus, string> = {
  available: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  deposit_paid: "border-amber-500/45 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  sold: "border-destructive/40 bg-destructive/10 text-destructive",
  inactive: "border-border/70 bg-muted/60 text-muted-foreground",
};

export const unitStatusToneFor = (status: string): string =>
  unitStatusTone[status as UnitStatus] ?? unitStatusTone.inactive;

/** How a unit's code is built from its floor and its position on that floor. */
export type UnitIdentifierStyle = "letter";

export function floorLabel(level: number): string {
  const lastTwo = level % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${level}th Floor`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[level % 10];
  return `${level}${suffix ?? "th"} Floor`;
}

/** 1 -> A, 26 -> Z, 27 -> AA. */
function letterFor(index: number): string {
  let remaining = index;
  let code = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    code = String.fromCharCode(65 + remainder) + code;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return code;
}

export function unitCode(level: number, index: number): string {
  return `${level}${letterFor(index)}`;
}
