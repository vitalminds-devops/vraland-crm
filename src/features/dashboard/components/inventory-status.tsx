import { cn } from "@/lib/utils/cn";
import type { DashboardData } from "../queries/dashboard.queries";
import { EmptyList } from "./priority-list";

/** Display names for the statuses the property form can write. */
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  reserved: "Reserved",
  pending: "Pending",
  under_contract: "Under contract",
  sold: "Sold",
  rented: "Rented",
  withdrawn: "Withdrawn",
  inactive: "Inactive",
};

const STATUS_BAR: Record<string, string> = {
  draft: "bg-muted-foreground/40",
  active: "bg-brand-4",
  reserved: "bg-brand-3",
  pending: "bg-brand-3",
  under_contract: "bg-brand-2",
  sold: "bg-brand-1",
  rented: "bg-brand-2",
  withdrawn: "bg-muted-foreground/40",
  inactive: "bg-muted-foreground/40",
};

export function InventoryStatus({ items }: { items: DashboardData["inventoryStatus"] }) {
  if (!items.length) return <EmptyList message="No properties yet." />;

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const share = total ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.status}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="capitalize text-foreground">
                {STATUS_LABELS[item.status] ?? item.status.replaceAll("_", " ")}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.value.toLocaleString()}
                <span className="ml-1.5 text-xs">{share}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn("h-full rounded-full", STATUS_BAR[item.status] ?? "bg-primary")}
                style={{ width: `${Math.max(share ? 3 : 0, share)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
