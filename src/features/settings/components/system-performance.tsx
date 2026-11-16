import type { ComponentType, ReactNode } from "react";
import { Activity, Boxes, Database, Server, Users } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { DotBadge } from "@/components/ui/dot-badge";
import { formatDateTime } from "@/features/contacts/lib/helpers";
import { getDatabaseMetrics, getUserActivityMetrics } from "@/lib/system/database-metrics";
import { scoreSystem } from "@/lib/system/health";
import { getRequestMetrics, getSystemHistory, timeLabel } from "@/lib/system/metrics";
import { getSystemPerformance } from "@/lib/system/performance";
import { cn } from "@/lib/utils/cn";
import { AutoRefresh } from "./auto-refresh";
import { HealthScoreCard } from "./health-score-card";
import { ApiResponseChart, CpuMemoryChart } from "./system-charts";

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Brand blue below 80%, amber at 80–89%, destructive from 90%. */
function barTone(percent: number): string {
  if (percent >= 90) return "bg-destructive";
  if (percent >= 80) return "bg-amber-500";
  return "bg-brand-4";
}

function MetricRow({
  label,
  value,
  detail,
  percent,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  percent?: number;
  tone?: string;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="min-w-0 text-right font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </div>
      {percent !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn("h-full rounded-full", tone ?? "bg-brand-4")}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card p-5">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="grid divide-y divide-border/50">{children}</div>
    </div>
  );
}

export async function SystemPerformancePanel({ className }: { className?: string }) {
  const [performance, database, users, requests, history] = await Promise.all([
    getSystemPerformance(),
    getDatabaseMetrics(),
    getUserActivityMetrics(),
    getRequestMetrics(),
    getSystemHistory(),
  ]);

  const { cpu, memory, disk } = performance;
  const health = scoreSystem({
    server: {
      cpuPercent: cpu.usedPercent ?? 0,
      memPercent: memory.usedPercent,
      diskPercent: disk?.usedPercent ?? null,
    },
    app: {
      averageResponseMs: requests.averageResponseMs,
      requestsLastMinute: requests.requestsPerMinute,
      errors5xxSinceStart: requests.errors5xxSinceStart,
      requestsSinceStart: requests.requestsSinceStart,
    },
    database: {
      online: database.online,
      activeConnections: database.activeConnections,
      maxConnections: database.maxConnections,
      slowQueries: database.slowQueries.length,
    },
  });

  const connectionPercent =
    database.activeConnections !== null && database.maxConnections
      ? Math.round((database.activeConnections / database.maxConnections) * 100)
      : null;

  const hasLoad = cpu.loadAverage.some((value) => value > 0);
  const hostLabel = `${performance.platform} · ${performance.arch}`;

  return (
    <Card className={cn("overflow-hidden rounded-2xl", className)}>
      <AutoRefresh />
      <CardHeader className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Activity className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">System monitor</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Infrastructure, application and service health
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <span
              className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none"
              aria-hidden="true"
            />
            Live
          </span>
          <span>Updated {formatDateTime(performance.sampledAt)}</span>
        </div>
      </CardHeader>

      <div className="grid gap-4 bg-muted/20 p-4 sm:p-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        {/* Health score */}
        <HealthScoreCard health={health} />

        {/* Charts */}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border/70 bg-card p-5">
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">CPU &amp; memory</h3>
                <span className="text-[10px] text-muted-foreground">Last 60 seconds</span>
              </div>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
                <p className="text-2xl font-semibold tracking-tight">
                  {cpu.usedPercent ?? "—"}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">% CPU</span>
                </p>
                <p className="text-sm font-medium text-muted-foreground">
                  {memory.usedPercent}% RAM
                </p>
              </div>
            </div>
            <CpuMemoryChart
              data={history.map((sample) => ({
                label: timeLabel(sample.at),
                cpu: sample.cpuPercent,
                mem: sample.memPercent,
              }))}
            />
          </div>
          <div className="min-w-0 rounded-xl border border-border/70 bg-card p-5">
            <div className="mb-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">API response time</h3>
                <span className="text-[10px] text-muted-foreground">Last 60 seconds</span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">
                {requests.averageResponseMs ?? "—"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">ms average</span>
              </p>
            </div>
            <ApiResponseChart data={requests.history} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-border/60 bg-muted/20 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-4">
        <Section title="Server" icon={Server}>
          <MetricRow
            label="CPU"
            value={`${cpu.usedPercent ?? "—"}%`}
            detail={`${cpu.cores} cores${hasLoad ? ` · load ${cpu.loadAverage[0].toFixed(2)}` : ""}`}
            percent={cpu.usedPercent ?? undefined}
            tone={barTone(cpu.usedPercent ?? 0)}
          />
          <MetricRow
            label="Memory"
            value={`${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`}
            detail={`${memory.usedPercent}% in use`}
            percent={memory.usedPercent}
            tone={barTone(memory.usedPercent)}
          />
          {disk ? (
            <MetricRow
              label="Disk"
              value={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`}
              detail={`${disk.usedPercent}% · ${disk.path}`}
              percent={disk.usedPercent}
              tone={barTone(disk.usedPercent)}
            />
          ) : (
            <MetricRow label="Disk" value="Unavailable" detail="Not available on this host." />
          )}
          <MetricRow
            label="Uptime"
            value={formatUptime(performance.hostUptimeSeconds)}
            detail={cpu.model}
          />
        </Section>

        <Section title="App" icon={Boxes}>
          <MetricRow label="Process memory" value={formatBytes(memory.processRssBytes)} />
          <MetricRow
            label="Avg API response"
            value={requests.averageResponseMs === null ? "—" : `${requests.averageResponseMs} ms`}
            detail="Last minute"
          />
          <MetricRow
            label="Requests / minute"
            value={requests.requestsPerMinute.toLocaleString()}
            detail={`${requests.requestsSinceStart.toLocaleString()} since start`}
          />
          <MetricRow
            label="5xx responses"
            value={requests.errors5xxSinceStart.toLocaleString()}
            detail={`Of ${requests.requestsSinceStart.toLocaleString()} since start`}
          />
          <MetricRow
            label="App uptime"
            value={formatUptime(performance.processUptimeSeconds)}
            detail={`Node ${performance.nodeVersion} · ${hostLabel}`}
          />
        </Section>

        <Section title="Database" icon={Database}>
          <MetricRow
            label="Status"
            value={
              <DotBadge tone={database.online ? "green" : "red"}>
                {database.online ? "Online" : "Offline"}
              </DotBadge>
            }
            detail={
              database.online ? `Ping ${database.latencyMs} ms` : (database.error ?? "Unreachable")
            }
          />
          <MetricRow
            label="Connections"
            value={
              database.activeConnections === null
                ? "—"
                : `${database.activeConnections} / ${database.maxConnections ?? "—"}`
            }
            detail={connectionPercent === null ? undefined : `${connectionPercent}% of max`}
            percent={connectionPercent ?? undefined}
            tone={barTone(connectionPercent ?? 0)}
          />
          <MetricRow label="Size" value={formatBytes(database.sizeBytes)} />
          <MetricRow
            label="Cache hit"
            value={database.cacheHitPercent === null ? "—" : `${database.cacheHitPercent}%`}
          />
          <MetricRow
            label="Transactions"
            value={
              database.transactionsPerSecond === null ? "—" : `${database.transactionsPerSecond}/s`
            }
          />
          <div className="py-3 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Slow queries</span>
              <span className="font-medium tabular-nums">{database.slowQueries.length}</span>
            </div>
            {database.slowQueries.length === 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">None over 1s.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {database.slowQueries.slice(0, 3).map((query) => (
                  <li
                    key={query.pid}
                    className="truncate rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                    title={query.query}
                  >
                    {query.seconds}s · {query.query}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Users" icon={Users}>
          <MetricRow
            label="Users online"
            value={users.usersOnline.toLocaleString()}
            detail="Last 15 minutes"
          />
          <MetricRow label="Active sessions" value={users.activeSessions.toLocaleString()} />
          <MetricRow label="Logins today" value={users.loginsToday.toLocaleString()} />
          <MetricRow label="Failed logins" value="Not recorded" />
        </Section>
      </div>
    </Card>
  );
}
