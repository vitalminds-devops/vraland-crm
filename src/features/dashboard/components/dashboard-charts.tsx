"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoneyShort } from "@/lib/utils/money";

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
    <figure
      className="w-full space-y-4"
      aria-label="Won sales and probability-weighted forecast chart"
    >
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 border-t-2"
            style={{ borderColor: CLOSED_COLOR }}
          />
          Won sales
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 border-t-2 border-dashed"
            style={{ borderColor: FORECAST_COLOR }}
          />
          Forecast (probability-weighted)
        </span>
      </figcaption>
      <div className="h-52 sm:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="closed-sales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CLOSED_COLOR} stopOpacity={0.18} />
                <stop offset="95%" stopColor={CLOSED_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="forecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={FORECAST_COLOR} stopOpacity={0.14} />
                <stop offset="95%" stopColor={FORECAST_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              minTickGap={16}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(value: number) => formatMoneyShort(value, currency) ?? ""}
              tickLine={false}
              axisLine={false}
              width={56}
              tick={axisTick}
            />
            <Tooltip
              formatter={(value) => formatMoneyShort(Number(value), currency) ?? ""}
              contentStyle={tooltipStyle}
            />
            <Area
              type="linear"
              dataKey="closedSales"
              name="Won sales"
              stroke={CLOSED_COLOR}
              fill="url(#closed-sales)"
              strokeWidth={2}
            />
            <Area
              type="linear"
              dataKey="forecast"
              name="Forecast (probability-weighted)"
              stroke={FORECAST_COLOR}
              fill="url(#forecast)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function PipelineStageChart({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return <ChartEmpty message="No opportunities yet." />;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 @min-[28rem]:flex-row @min-[28rem]:gap-5">
      <div aria-hidden="true" className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={72}
              paddingAngle={data.length > 1 ? 2 : 0}
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
            <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
              {total === 1 ? "Opportunity" : "Opportunities"}
            </p>
          </div>
        </div>
      </div>
      <div className="w-full min-w-0 @min-[28rem]:flex-1">
        <div
          aria-hidden="true"
          className="flex items-center gap-3 border-b border-border/60 pb-2 text-[11px] text-muted-foreground"
        >
          <span className="flex-1">Stage</span>
          <span className="w-8 text-right">Count</span>
          <span className="w-10 text-right">Share</span>
        </div>
        <ul aria-label="Opportunities by stage" className="divide-y divide-border/40">
          {data.map((entry, index) => {
            const share = total > 0 ? Math.round((entry.value / total) * 100) : 0;
            return (
              <li key={entry.name} className="flex items-center gap-3 py-2.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: chartRamp[index % chartRamp.length] }}
                />
                <span className="min-w-0 flex-1 text-xs leading-5 break-words text-foreground sm:text-sm">
                  {entry.name}
                </span>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                  {entry.value}
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {share}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
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
