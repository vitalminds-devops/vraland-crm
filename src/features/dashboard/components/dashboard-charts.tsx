"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactCurrency } from "../lib/format";

const chartRamp = Array.from({ length: 8 }, (_, index) => `var(--chart-${index + 1})`);

const CLOSED_COLOR = "var(--brand-1)";
const FORECAST_COLOR = "var(--brand-3)";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  borderColor: "var(--border)",
  borderRadius: 8,
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
};

export function RevenueChart({
  data,
  currency,
}: {
  data: { month: string; closedSales: number; forecast: number }[];
  currency: string;
}) {
  const hasData = data.some((point) => point.closedSales || point.forecast);
  if (!hasData) return <ChartEmpty message="No sales data yet." />;
  return (
    <div
      className="h-60 w-full sm:h-72"
      aria-label="Closed sales and probability-weighted forecast chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="closed-sales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CLOSED_COLOR} stopOpacity={0.32} />
              <stop offset="95%" stopColor={CLOSED_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="forecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.28} />
              <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(value: number) => compactCurrency(value, currency)}
            tickLine={false}
            axisLine={false}
            width={64}
            tick={axisTick}
          />
          <Tooltip
            formatter={(value) => compactCurrency(Number(value), currency)}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="closedSales"
            name="Closed sales"
            stroke={CLOSED_COLOR}
            fill="url(#closed-sales)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="forecast"
            name="Forecast (probability-weighted)"
            stroke={FORECAST_COLOR}
            fill="url(#forecast)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PipelineStageChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <ChartEmpty message="No opportunities yet." />;
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative mx-auto size-40 shrink-0 sm:mx-0 sm:size-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={74}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={chartRamp[index % chartRamp.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${Number(value)} opportunities`, "Opportunities"]}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{total}</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {total === 1 ? "Opportunity" : "Opportunities"}
            </p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 divide-y divide-border/60 sm:flex-1">
        {data.map((entry, index) => {
          const share = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <li key={entry.name} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chartRamp[index % chartRamp.length] }}
              />
              <span className="min-w-0 flex-1 text-sm break-words text-foreground">
                {entry.name}
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {entry.value}
              </span>
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm leading-6 text-muted-foreground">
      {message}
    </div>
  );
}
