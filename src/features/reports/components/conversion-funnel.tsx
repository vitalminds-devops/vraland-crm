import { safeRate } from "../lib/report-metrics";

export function ConversionFunnel({
  data,
}: {
  data: { key: string; label: string; value: number }[];
}) {
  const maximum = data[0]?.value ?? 0;
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.map((step, index) => {
        const prior = data[index - 1]?.value ?? step.value;
        return (
          <li key={step.key} className="relative rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {step.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{step.value}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${maximum ? Math.max(3, (step.value / maximum) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {index
                ? `${safeRate(step.value, prior)}% of ${data[index - 1].label}`
                : "Created in period"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
