"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CpuMemoryPoint = { label: string; cpu: number; mem: number };
export type ApiPoint = { label: string; ms: number | null };

const axisTick = { fill: "var(--muted-foreground)", fontSize: 10 };
const tooltipStyle = {
  borderColor: "var(--border)",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
};

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-52 place-items-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 text-center text-xs leading-relaxed text-muted-foreground">
      {message}
    </div>
  );
}

export function CpuMemoryChart({ data }: { data: CpuMemoryPoint[] }) {
  if (data.length < 2) return <ChartEmpty message="Collecting data…" />;

  return (
    <div className="h-52 w-full min-w-0" aria-label="CPU and memory over the last 60 seconds">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="monitor-cpu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--brand-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="monitor-mem" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand-4)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--brand-4)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${Number(value)}%`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="cpu"
            name="CPU"
            stroke="var(--chart-4)"
            fill="url(#monitor-cpu)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="mem"
            name="RAM"
            stroke="var(--chart-2)"
            fill="url(#monitor-mem)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ApiResponseChart({ data }: { data: ApiPoint[] }) {
  const hasData = data.some((point) => point.ms !== null);
  if (!hasData) return <ChartEmpty message="No requests in the last minute." />;

  return (
    <div
      className="h-52 w-full min-w-0"
      aria-label="Average API response time over the last minute"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={34}
            allowDecimals={false}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${Number(value)} ms`} />
          <Line
            type="monotone"
            dataKey="ms"
            name="Response"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
