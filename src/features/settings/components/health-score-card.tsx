import type { ServiceStatus, SystemScore } from "@/lib/system/health";

const TONES = {
  green: {
    text: "text-emerald-500",
    wash: "from-emerald-500/10 via-transparent to-transparent",
  },
  blue: {
    text: "text-brand-4",
    wash: "from-brand-4/10 via-transparent to-transparent",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    wash: "from-amber-500/10 via-transparent to-transparent",
  },
  red: {
    text: "text-destructive",
    wash: "from-destructive/10 via-transparent to-transparent",
  },
} as const;

const STATUS_STYLES: Record<ServiceStatus, { dot: string; label: string }> = {
  healthy: {
    dot: "bg-emerald-500",
    label: "Healthy",
  },
  attention: {
    dot: "bg-amber-500",
    label: "Attention",
  },
  critical: {
    dot: "bg-destructive",
    label: "Critical",
  },
};

function toneFor(score: number) {
  if (score >= 90) return TONES.green;
  if (score >= 75) return TONES.blue;
  if (score >= 60) return TONES.amber;
  return TONES.red;
}

function ServiceIndicator({ label, status }: { label: string; status: ServiceStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <li
      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
      title={`${label}: ${style.label}`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span>
        {label}
        <span className="sr-only">: {style.label}</span>
      </span>
    </li>
  );
}

export function HealthScoreCard({ health }: { health: SystemScore }) {
  const score = Math.min(100, Math.max(0, health.score));
  const tone = toneFor(score);

  return (
    <section
      aria-labelledby="system-health-title"
      className="relative isolate flex min-w-0 flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-border/70 bg-card p-5 text-center"
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br ${tone.wash}`}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] ring-1 ring-inset ring-white/50 dark:ring-white/[0.05]"
      />

      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        System health
      </p>
      <div className={`relative grid size-28 place-items-center ${tone.text}`}>
        <div
          aria-hidden="true"
          className="absolute inset-6 rounded-full bg-current opacity-[0.08] blur-2xl"
        />
        <svg viewBox="0 0 120 120" className="size-28" aria-hidden="true">
          <defs>
            <linearGradient id="system-health-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="8"
            strokeOpacity="0.6"
            className="stroke-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            stroke="url(#system-health-ring)"
            transform="rotate(-90 60 60)"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - score}
            className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
          />
        </svg>
        <div className="absolute inset-0 grid place-content-center">
          <p className="text-[36px] leading-none font-semibold tracking-[-0.045em] tabular-nums">
            <span className="sr-only">Health score </span>
            {health.score}
          </p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            <span aria-hidden="true">/ 100</span>
            <span className="sr-only"> out of 100</span>
          </p>
        </div>
      </div>

      <div className="max-w-[26ch]">
        <h3
          id="system-health-title"
          className="text-[15px] leading-tight font-semibold tracking-[-0.01em]"
        >
          {health.label}
        </h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{health.note}</p>
      </div>

      <ul aria-label="Service status" className="flex justify-center gap-4">
        <ServiceIndicator label="App" status={health.app} />
        <ServiceIndicator label="DB" status={health.database} />
        <ServiceIndicator label="Server" status={health.server} />
      </ul>
    </section>
  );
}
