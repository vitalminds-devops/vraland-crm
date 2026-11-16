import type { ComponentType } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  trend,
  href,
  active = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  /** Percentage change against the previous period; `null` means "no baseline". */
  trend?: number | null;
  /** Where the figure comes from, when the viewer may open it. */
  href?: string;
  /** Marks the card as the filter currently applied to the list below it. */
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {trend !== undefined && <TrendPill trend={trend} />}
        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </>
  );

  const shell = cn(
    "min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs",
    active && "border-primary/50 ring-[3px] ring-primary/15",
  );

  if (href)
    return (
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={cn(
          shell,
          "block transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none",
        )}
      >
        {body}
      </Link>
    );

  return <section className={shell}>{body}</section>;
}

function TrendPill({ trend }: { trend: number | null }) {
  if (trend === null)
    return (
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        New
      </span>
    );
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        trend === 0
          ? "bg-muted text-muted-foreground"
          : trend > 0
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "bg-destructive/10 text-destructive",
      )}
    >
      {trend > 0 ? "+" : ""}
      {trend}%
    </span>
  );
}
