import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={cn("mt-1 text-sm text-foreground", mono && "font-mono text-[13px]")}>
        {value}
      </dd>
    </div>
  );
}

export function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-content-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span>
        <span className="block text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="block text-lg font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  );
}
