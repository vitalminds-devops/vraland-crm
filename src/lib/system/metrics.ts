import "server-only";

import { Server, type ServerResponse } from "node:http";
import os from "node:os";

export type SystemSample = {
  at: number;
  cpuPercent: number;
  memPercent: number;
};

export type RequestSample = {
  at: number;
  durationMs: number;
  status: number;
};

type MetricsState = {
  started: boolean;
  samples: SystemSample[];
  requests: RequestSample[];
  requestsTotal: number;
  errorsTotal: number;
};

const GLOBAL_KEY = "__vraland_system_metrics__";
/** 60 seconds of history at one sample every two seconds. */
const MAX_SAMPLES = 30;
const SAMPLE_INTERVAL_MS = 2_000;
/** Requests are kept for five minutes — enough for a minute view and a chart. */
const REQUEST_RETENTION_MS = 5 * 60_000;
const MAX_REQUESTS = 4_000;

function getState(): MetricsState {
  const store = globalThis as unknown as Record<string, MetricsState | undefined>;
  store[GLOBAL_KEY] ??= {
    started: false,
    samples: [],
    requests: [],
    requestsTotal: 0,
    errorsTotal: 0,
  };
  return store[GLOBAL_KEY];
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Manila",
});

export function timeLabel(at: number): string {
  return timeFormatter.format(new Date(at));
}

/** Busy percentage from the per-core tick counters (average since boot). */
function cpuPercent(): number {
  const cpus = os.cpus();
  const ticks = cpus.reduce(
    (acc, cpu) => {
      const { user, nice, sys, idle, irq } = cpu.times;
      acc.total += user + nice + sys + idle + irq;
      acc.idle += idle;
      return acc;
    },
    { total: 0, idle: 0 },
  );
  return ticks.total > 0 ? Math.round(((ticks.total - ticks.idle) / ticks.total) * 100) : 0;
}

function takeSample(): void {
  const state = getState();
  state.samples.push({
    at: Date.now(),
    cpuPercent: cpuPercent(),
    memPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
  });
  if (state.samples.length > MAX_SAMPLES) state.samples.shift();
}

function recordRequest(durationMs: number, status: number): void {
  const state = getState();
  const now = Date.now();
  state.requestsTotal += 1;
  if (status >= 500) state.errorsTotal += 1;
  state.requests.push({ at: now, durationMs, status });

  const cutoff = now - REQUEST_RETENTION_MS;
  while (state.requests.length && state.requests[0].at < cutoff) {
    state.requests.shift();
  }
  if (state.requests.length > MAX_REQUESTS) {
    state.requests.splice(0, state.requests.length - MAX_REQUESTS);
  }
}

function patchHttpServer(): void {
  const proto = Server.prototype as Server & {
    __vralandMetricsPatched?: boolean;
  };
  if (proto.__vralandMetricsPatched) return;
  proto.__vralandMetricsPatched = true;

  const originalEmit = proto.emit;
  proto.emit = function (this: Server, event: string | symbol, ...args: unknown[]): boolean {
    if (event === "request") {
      const response = args[1] as ServerResponse | undefined;
      if (response && typeof response.once === "function") {
        const started = performance.now();
        response.once("finish", () => {
          recordRequest(performance.now() - started, response.statusCode);
        });
      }
    }
    return (originalEmit as (...values: unknown[]) => boolean).apply(this, [event, ...args]);
  };
}

export function startSystemMonitoring(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  try {
    patchHttpServer();
  } catch {}

  takeSample();
  const timer = setInterval(takeSample, SAMPLE_INTERVAL_MS);
  timer.unref?.();
}

export function getSystemHistory(): SystemSample[] {
  return [...getState().samples];
}

export type RequestMetrics = {
  requestsPerMinute: number;
  averageResponseMs: number | null;
  errors5xxSinceStart: number;
  requestsSinceStart: number;
  /** Twelve five-second buckets over the last minute; `ms` is null when quiet. */
  history: { label: string; ms: number | null }[];
};

export function getRequestMetrics(): RequestMetrics {
  const state = getState();
  const now = Date.now();
  const lastMinute = state.requests.filter((request) => request.at >= now - 60_000);
  const average =
    lastMinute.length > 0
      ? lastMinute.reduce((sum, request) => sum + request.durationMs, 0) / lastMinute.length
      : null;

  const bucketMs = 5_000;
  const bucketCount = 12;
  const history = Array.from({ length: bucketCount }, (_, index) => {
    const start = now - (bucketCount - index) * bucketMs;
    const end = start + bucketMs;
    const bucket = state.requests.filter((request) => request.at >= start && request.at < end);
    return {
      label: timeLabel(start),
      ms:
        bucket.length > 0
          ? Math.round(bucket.reduce((sum, request) => sum + request.durationMs, 0) / bucket.length)
          : null,
    };
  });

  return {
    requestsPerMinute: lastMinute.length,
    averageResponseMs: average === null ? null : Math.round(average),
    errors5xxSinceStart: state.errorsTotal,
    requestsSinceStart: state.requestsTotal,
    history,
  };
}
