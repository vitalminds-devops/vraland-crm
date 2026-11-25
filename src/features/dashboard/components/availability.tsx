import type { ReactNode } from "react";

/**
 * How much is still for sale, as a share: a meter reads "37 of 60" at a glance where two separate
 * numbers make you do the sum.
 */
export function AvailabilityMeter({
  label,
  available,
  total,
  unit,
}: {
  label: string;
  available: number;
  total: number;
  /** "unit" / "slot", pluralised for the total. */
  unit: string;
}) {
  const share = total ? Math.round((available / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{available.toLocaleString()}</span>
          <span className="text-muted-foreground">
            {" "}
            of {total.toLocaleString()} {total === 1 ? unit : `${unit}s`}
          </span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={available}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${available ? Math.max(2, share) : 0}%` }}
        />
      </div>
    </div>
  );
}

/** A quiet line of supporting counts under the meters: "18 active properties · 24 floors". */
export function FactLine({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted-foreground tabular-nums">{children}</p>;
}
