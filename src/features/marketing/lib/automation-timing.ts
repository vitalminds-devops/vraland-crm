type TimedStep = { actionType: string; delayMinutes: number };

/**
 * When a step may run (`step` null: when the enrollment may complete). `anchor` is when the
 * previous step ran (or the enrollment, for the first).
 * A step's delay is "minutes before it runs", except a wait step, whose delay holds back the step after it.
 */
export function stepDueAt(anchor: Date, step: TimedStep | null, previous: TimedStep | null) {
  const minutes =
    (!step || step.actionType === "wait" ? 0 : step.delayMinutes) +
    (previous?.actionType === "wait" ? previous.delayMinutes : 0);
  return new Date(anchor.getTime() + minutes * 60_000);
}

/** A step's wait in words, e.g. "3 days", "1 day 2 hours", "Right away". */
export function waitLabel(minutes: number) {
  if (minutes <= 0) return "Right away";
  const parts = [
    [Math.floor(minutes / 1_440), "day"],
    [Math.floor((minutes % 1_440) / 60), "hour"],
    [minutes % 60, "minute"],
  ] as const;
  return parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`)
    .join(" ");
}
