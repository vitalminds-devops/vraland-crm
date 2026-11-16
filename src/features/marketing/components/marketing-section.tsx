import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const marketingCardClass =
  "rounded-xl border border-border/50 bg-card p-5 shadow-xs dark:shadow-none";

export function MarketingSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(marketingCardClass, "min-w-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h2 className="text-[16px] font-semibold leading-none">{title}</h2>
          {description ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

export function MarketingStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl leading-none font-semibold tabular-nums">{value}</p>
      {detail ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export function MarketingInfo({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words">{value}</dd>
    </div>
  );
}
