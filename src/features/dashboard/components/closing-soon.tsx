import Link from "next/link";
import { format, parseISO } from "date-fns";

import type { DashboardData } from "../queries/dashboard.queries";
import { compactCurrency } from "../lib/format";
import { EmptyList } from "./priority-list";

export function ClosingSoon({
  items,
  currency,
}: {
  items: DashboardData["closingSoon"];
  currency: string;
}) {
  if (!items.length) return <EmptyList message="No closings in the next 30 days." />;

  return (
    <ul className="divide-y divide-border/60">
      {items.map((deal) => (
        <li
          key={deal.id}
          className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <Link
              href={`/deals/${deal.id}`}
              className="block truncate text-sm font-medium text-foreground hover:underline"
            >
              {deal.title}
            </Link>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {deal.stageName ?? "No stage"}
              {deal.agentName ? ` · ${deal.agentName}` : ""} · {deal.probability}% probability
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-medium tabular-nums">
              {compactCurrency(deal.amount, currency)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {deal.expectedCloseDate
                ? format(parseISO(deal.expectedCloseDate), "d MMM")
                : "No date"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
