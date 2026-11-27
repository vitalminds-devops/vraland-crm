import { formatAmount } from "@/lib/utils/money";
import type { DotBadgeTone } from "@/components/ui/dot-badge";
import type { BillStatus } from "../queries/billing.queries";

export const peso = (value: string | number | null | undefined) => formatAmount(value) ?? "—";

/** `yyyy-MM-dd` from a date column, shown as a Manila calendar date. */
export const calendarDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

export const billStatusBadge: Record<BillStatus, { label: string; tone: DotBadgeTone }> = {
  unbilled: { label: "Not billed", tone: "gray" },
  unpaid: { label: "Billed · unpaid", tone: "amber" },
  partial: { label: "Partially paid", tone: "blue" },
  paid: { label: "Fully paid", tone: "green" },
};
