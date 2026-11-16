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
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={70}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(value) => compact(Number(value), currency)} />
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
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={70}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(value) => compact(Number(value), currency)} />
          <Legend />
          <Line
            type="monotone"
            dataKey="gross"
            name="Gross pipeline"
            stroke="#6f56b3"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="weighted"
            name="Weighted forecast"
            stroke="#0f766e"
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
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(value) => compact(Number(value), currency)}
            tickLine={false}
            axisLine={false}
            width={80}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) =>
              Array.isArray(value)
                ? value.map((number) => compact(Number(number), currency)).join(" – ")
                : compact(Number(value), currency)
            }
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
      No data matches this period.
    </div>
  );
}
