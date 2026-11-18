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
          className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 @min-[24rem]:flex-row @min-[24rem]:items-start @min-[24rem]:justify-between @min-[24rem]:gap-3"
        >
          <div className="min-w-0">
            <Link
              href={`/deals/${deal.id}`}
              className="block text-sm font-medium break-words text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {deal.title}
            </Link>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {deal.stageName ?? "No stage"}
              {deal.agentName ? ` · ${deal.agentName}` : ""} · {deal.probability}% probability
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-3 @min-[24rem]:block @min-[24rem]:shrink-0 @min-[24rem]:text-right">
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
