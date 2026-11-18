import { format, isBefore, isToday, isTomorrow } from "date-fns";
import { CalendarCheck2, CheckSquare2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { DashboardData } from "../queries/dashboard.queries";

export function PriorityList({ items }: { items: DashboardData["priorities"] }) {
  if (!items.length)
    return <EmptyList message="No overdue or upcoming items in the next 7 days." />;
  return (
    <ul className="divide-y divide-border/60">
      {items.map((item) => {
        const overdue = item.dueAt ? isBefore(item.dueAt, new Date()) : false;
        const Icon = item.source === "viewing" ? CalendarCheck2 : CheckSquare2;
        return (
          <li
            key={`${item.source}-${item.id}`}
            className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 @min-[24rem]:grid-cols-[2rem_minmax(0,1fr)_auto]"
          >
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words text-foreground">{item.title}</p>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {item.source === "viewing"
                  ? "Viewing"
                  : `${item.type.replaceAll("_", " ")} · ${item.priority} priority`}
              </p>
            </div>
            <span
              className={cn(
                "col-start-2 text-xs font-medium tabular-nums @min-[24rem]:col-start-auto @min-[24rem]:text-right",
                overdue ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {dueLabel(item.dueAt, overdue)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function dueLabel(dueAt: Date | null, overdue: boolean) {
  if (!dueAt) return "No due time";
  if (overdue) return "Overdue";
  if (isToday(dueAt)) return `Today, ${format(dueAt, "h:mm a")}`;
  if (isTomorrow(dueAt)) return "Tomorrow";
  return format(dueAt, "d MMM");
}

/** The dashed placeholder every dashboard list falls back to when it is empty. */
export function EmptyList({ message }: { message: string }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-5 text-center text-sm leading-6 text-muted-foreground">
      {message}
    </div>
  );
}
