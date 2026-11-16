import { cn } from "@/lib/utils/cn";
import type { DashboardData } from "../queries/dashboard.queries";

export function ReadingList({ items }: { items: DashboardData["readings"] }) {
  return (
    <dl className="divide-y divide-border/60">
      {items.map((reading) => (
        <div
          key={reading.key}
          className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <dt className="text-sm font-medium text-foreground">{reading.label}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{reading.hint}</dd>
          </div>
          <dd
            className={cn(
              "shrink-0 text-lg font-semibold tabular-nums",
              reading.tone === "attention" ? "text-destructive" : "text-foreground",
            )}
          >
            {reading.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
