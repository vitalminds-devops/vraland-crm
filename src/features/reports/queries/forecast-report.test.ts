import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { deals } from "@/db/schema";
import { getForecastReport } from "./report.queries";

const fixture = vi.hoisted(() => ({ rows: [] as unknown[][], conditions: [] as unknown[] }));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const rows = fixture.rows.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: (condition: unknown) => {
          fixture.conditions.push(condition);
          return query;
        },
        limit: () => query,
        groupBy: () => query,
        orderBy: () => query,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "organization-1", userId: "user-1" }),
}));
vi.mock("@/lib/permissions/policy", () => ({ hasOrganizationWideAccess: () => false }));
vi.mock("@/lib/permissions/scope", () => ({
  dealScopeCondition: () => eq(deals.primaryAgentUserId, "user-1"),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T04:00:00Z"));
  fixture.conditions = [];
  fixture.rows = [
    [{ currency: "PHP" }],
    [{ deals: 0, gross: "0", weighted: "0" }],
    [],
    [],
    Array.from({ length: 6 }, (_, index) => ({
      month: `2026-${String(index + 5).padStart(2, "0")}`,
      value: String(100 + index * 10),
    })),
  ];
});
afterEach(() => vi.useRealTimers());

it("wires completed monthly sales into six future ARIMA projections", async () => {
  const data = await getForecastReport({ from: "2026-01-01", to: "2026-11-09" });
  expect(data.arima.trainedThrough).toBe("2026-10");
  expect(data.arima.forecast[0]).toMatchObject({ month: "2026-11", value: 160 });
  expect(data.arima.forecast.at(-1)).toMatchObject({ month: "2027-04", value: 210 });
  expect(data.arima.forecast).toHaveLength(6);
});

it("keeps training organization-, owner-, currency- and filter-scoped and excludes partial months", async () => {
  await getForecastReport({
    from: "2026-01-01",
    to: "2026-11-09",
    development: "development-1",
    propertyType: "condominium",
  });
  const query = new PgDialect().sqlToQuery(fixture.conditions.at(-1) as SQL);
  expect(query.params).toEqual(
    expect.arrayContaining([
      "organization-1",
      "user-1",
      "PHP",
      "development-1",
      "condominium",
      "won",
      "2026-11-01",
    ]),
  );
  expect(query.sql).toContain('"deals"."actual_close_date" <');
});

it("returns a usable empty state instead of invented projections when history is insufficient", async () => {
  fixture.rows[4] = [{ month: "2026-10", value: "100" }];
  const data = await getForecastReport({ from: "2026-01-01", to: "2026-11-09" });
  expect(data.arima.model).toBeNull();
  expect(data.arima.forecast).toEqual([]);
  expect(data.arima.observations).toBe(1);
});
