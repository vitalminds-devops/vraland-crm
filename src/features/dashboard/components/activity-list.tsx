import { formatDistanceToNowStrict } from "date-fns";
import { Activity } from "lucide-react";
import type { DashboardData } from "../queries/dashboard.queries";
import { EmptyList } from "./priority-list";

export function ActivityList({ items }: { items: DashboardData["activities"] }) {
  if (!items.length) return <EmptyList message="No activity yet." />;
  return (
    <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3">
          <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground">
            <Activity aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm leading-5 text-foreground">{item.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.actorFirstName ? `${item.actorFirstName} ${item.actorLastName ?? ""} · ` : ""}
              {formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
