import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { DashboardData } from "../queries/dashboard.queries";

export function TaskLoad({ data }: { data: DashboardData["taskLoad"] }) {
  const buckets = [
    {
      key: "overdue",
      label: "Overdue",
      value: data.overdue,
      attention: data.overdue > 0,
    },
    {
      key: "today",
      label: "Due today",
      value: data.dueToday,
      attention: false,
    },
    {
      key: "week",
      label: "Next 7 days",
      value: data.thisWeek,
      attention: false,
    },
    {
      key: "unscheduled",
      label: "No due date",
      value: data.unscheduled,
      attention: false,
    },
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 gap-3">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <dt className="text-xs text-muted-foreground">{bucket.label}</dt>
            <dd
              className={cn(
                "mt-1 text-xl font-semibold tabular-nums",
                bucket.attention ? "text-destructive" : "text-foreground",
              )}
            >
              {bucket.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
        {data.completedThisWeek.toLocaleString()} completed this week
      </p>
    </div>
  );
}
