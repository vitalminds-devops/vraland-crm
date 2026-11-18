import { safeRate } from "../lib/report-metrics";

export function ConversionFunnel({
  data,
}: {
  data: { key: string; label: string; value: number }[];
}) {
  const maximum = data[0]?.value ?? 0;
  if (!maximum)
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm leading-relaxed text-muted-foreground">
        No contacts were created in this period with these filters. Try a wider date range or reset
        the filters.
      </p>
    );
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.map((step, index) => {
        const prior = data[index - 1]?.value ?? step.value;
        return (
          <li key={step.key} className="relative rounded-xl border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground">{step.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {step.value.toLocaleString()}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(step.value / maximum) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {index
                ? prior > 0
                  ? `${safeRate(step.value, prior)}% of ${data[index - 1].label}`
                  : "No contacts reached the previous stage"
                : "Created in period"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
