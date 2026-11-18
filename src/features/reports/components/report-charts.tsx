"use client";

import {
  Bar,
  Area,
  ComposedChart,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { reportMonth } from "../lib/report-metrics";

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--card)",
  borderColor: "var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
};
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(value);

const compact = (value: number, currency: string) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export function SalesTrendChart({
  data,
  currency,
}: {
  data: { month: string; deals: number; value: number }[];
  currency: string;
}) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div className="h-72" role="img" aria-label="Won sales by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={reportMonth}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={70}
            tick={axisTick}
          />
          <Tooltip
            formatter={(value) => money(Number(value), currency)}
            labelFormatter={(label) => reportMonth(String(label))}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="value" name="Closed sales" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastChart({
  data,
  currency,
}: {
  data: { month: string; gross: number; weighted: number }[];
  currency: string;
}) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div
      className="h-72"
      role="img"
      aria-label="Total and probability-weighted pipeline values by expected close month"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={reportMonth}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={70}
            tick={axisTick}
          />
          <Tooltip
            formatter={(value) => money(Number(value), currency)}
            labelFormatter={(label) => reportMonth(String(label))}
            contentStyle={tooltipStyle}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="gross"
            name="Total pipeline value"
            stroke="var(--brand-1)"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="weighted"
            name="Weighted sales forecast"
            stroke="var(--brand-3)"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ArimaForecastChart({
  history,
  forecast,
  currency,
}: {
  history: { month: string; value: number }[];
  forecast: { month: string; value: number; lower: number; upper: number }[];
  currency: string;
}) {
  const last = history.at(-1);
  const data = [
    ...history.map((point) => ({
      month: point.month,
      actual: point.value,
      forecast: point === last ? point.value : null,
      interval: null,
    })),
    ...forecast.map((point) => ({
      month: point.month,
      actual: null,
      forecast: point.value,
      interval: [point.lower, point.upper],
    })),
  ];
  return (
    <div
      className="h-80"
      role="img"
      aria-label="Historical closed sales and six-month ARIMA forecast with 95 percent prediction intervals"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={reportMonth}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={80}
            tick={axisTick}
          />
          <Tooltip
            formatter={(value) =>
              Array.isArray(value)
                ? value.map((number) => money(Number(number), currency)).join(" – ")
                : money(Number(value), currency)
            }
            labelFormatter={(label) => reportMonth(String(label))}
            contentStyle={tooltipStyle}
          />
          <Legend />
          <Area
            type="linear"
            dataKey="interval"
            name="95% prediction interval"
            stroke="none"
            fill="var(--primary)"
            fillOpacity={0.12}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="actual"
            name="Closed sales"
            stroke="var(--foreground)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="forecast"
            name="ARIMA forecast"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="grid h-72 place-items-center text-sm text-muted-foreground">
      No data matches this date range and these filters.
    </div>
  );
}
