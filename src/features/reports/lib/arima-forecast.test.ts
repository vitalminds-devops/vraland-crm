import { expect, it } from "vitest";
import { arimaForecast, monthlySalesHistory } from "./arima-forecast";

it("forecasts an exact linear trend by integrating its drift", () => {
  const result = arimaForecast([100, 110, 120, 130, 140, 150]);
  expect(result?.model).toBe("ARIMA(1,1,0)");
  expect(result?.forecast.map((point) => point.value)).toEqual([160, 170, 180, 190, 200, 210]);
});
it("learns autoregressive changes rather than repeating the latest sales value", () => {
  let value = 100,
    change = 80;
  const values = [value];
  for (let index = 0; index < 15; index++) {
    change = 5 + 0.5 * change;
    value += change;
    values.push(value);
  }
  const result = arimaForecast(values, 3)!;
  for (const prediction of result.forecast) {
    change = 5 + 0.5 * change;
    value += change;
    expect(prediction.value).toBeCloseTo(value, 2);
  }
});
it("handles constant history and never reports negative sales or inverted intervals", () => {
  expect(arimaForecast(Array(12).fill(100))?.forecast.every((point) => point.value === 100)).toBe(
    true,
  );
  const result = arimaForecast([140, 80, 120, 60, 100, 50, 80, 30, 50, 20])!;
  for (const point of result.forecast) {
    expect(point.lower).toBeGreaterThanOrEqual(0);
    expect(point.lower).toBeLessThanOrEqual(point.value);
    expect(point.value).toBeLessThanOrEqual(point.upper);
  }
});
it("requires enough real history and rejects unusable input", () => {
  for (const values of [[100, 200], Array(12).fill(0), [1, 2, 3, 4, 5, NaN], [1, 2, 3, 4, 5, -1]])
    expect(arimaForecast(values)).toBeNull();
  expect(arimaForecast([1, 2, 3, 4, 5, 6], 13)).toBeNull();
});

it("fills missing months but excludes partial/future months and periods before the first sale", () => {
  expect(
    monthlySalesHistory(
      [
        { month: "2025-11", value: 100 },
        { month: "2026-01", value: 200 },
        { month: "2026-02", value: 999 },
      ],
      "2026-02",
    ),
  ).toEqual([
    { month: "2025-11", value: 100 },
    { month: "2025-12", value: 0 },
    { month: "2026-01", value: 200 },
  ]);
  expect(monthlySalesHistory([], "2026-02")).toEqual([]);
});
