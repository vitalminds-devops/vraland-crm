import { toCents } from "@/lib/utils/money";

/** Preserve zero-sales months inside the observed history, without adding invented history before it. */
export function monthlySalesHistory(rows: { month: string; value: number }[], cutoff: string) {
  const indexOf = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const end = indexOf(cutoff);
  const available = rows.filter(
    (row) => indexOf(row.month) < end && indexOf(row.month) >= end - 36,
  );
  if (!available.length) return [];
  const start = Math.min(...available.map((row) => indexOf(row.month)));
  const byMonth = new Map(available.map((row) => [row.month, row.value]));
  return Array.from({ length: end - start }, (_, offset) => {
    const index = start + offset;
    const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    return { month, value: byMonth.get(month) ?? 0 };
  });
}

/** ARIMA(1,1,0) with drift: fit an AR(1) to first differences, then integrate predictions. */
export function arimaForecast(values: number[], horizon = 6) {
  if (
    values.length < 6 ||
    !Number.isInteger(horizon) ||
    horizon < 1 ||
    horizon > 12 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    return null;
  const scale = Math.max(...values);
  if (!scale) return null;
  const series = values.map((value) => value / scale);
  const differences = series.slice(1).map((value, index) => value - series[index]);
  const x = differences.slice(0, -1);
  const y = differences.slice(1);
  const mean = (rows: number[]) => rows.reduce((sum, value) => sum + value, 0) / rows.length;
  const meanX = mean(x),
    meanY = mean(y);
  const variance = x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  // Constrain the differenced process to be stationary; constant changes reduce to a drift model.
  const phi =
    variance < 1e-12
      ? 0
      : Math.max(
          -0.95,
          Math.min(
            0.95,
            x.reduce((sum, value, index) => sum + (value - meanX) * (y[index] - meanY), 0) /
              variance,
          ),
        );
  const intercept = meanY - phi * meanX;
  const errorVariance =
    y.reduce((sum, value, index) => sum + (value - intercept - phi * x[index]) ** 2, 0) /
    (y.length - 2);
  let level = series.at(-1)!;
  let difference = differences.at(-1)!;
  let cumulativeResponse = 0,
    predictionVariance = 0;
  const money = (value: number) => toCents(Math.max(0, value * scale)) / 100;
  const forecast = Array.from({ length: horizon }, (_, index) => {
    difference = intercept + phi * difference;
    level += difference;
    cumulativeResponse += phi ** index;
    predictionVariance += errorVariance * cumulativeResponse ** 2;
    const margin = 1.96 * Math.sqrt(predictionVariance);
    return { value: money(level), lower: money(level - margin), upper: money(level + margin) };
  });
  return { model: "ARIMA(1,1,0)" as const, observations: values.length, forecast };
}
