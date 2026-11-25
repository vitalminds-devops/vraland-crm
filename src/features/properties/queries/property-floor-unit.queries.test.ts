import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getPropertyInventory, getPropertyInventoryForGrants } from "./property-floor-unit.queries";

const fixture = vi.hoisted(() => ({ rows: [] as unknown[][], filters: [] as SQL[] }));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: (condition: SQL) => {
          fixture.filters.push(condition);
          return query;
        },
        limit: async () => fixture.rows.shift() ?? [],
        orderBy: async () => fixture.rows.shift() ?? [],
      };
      return query;
    },
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  AuthorizationError: class extends Error {},
  requirePermission: vi.fn(),
}));
vi.mock("@/lib/permissions/property-access", () => ({
  grantedPropertyCondition: (_context: unknown, columns: { propertyId: AnyPgColumn }) =>
    eq(columns.propertyId, "property"),
  grantedFloorsCondition: (_context: unknown, columns: { floorId: AnyPgColumn }) =>
    eq(columns.floorId, "granted-floor"),
  grantedUnitsCondition: (_context: unknown, columns: { unitId: AnyPgColumn }) =>
    eq(columns.unitId, "granted-unit"),
}));

beforeEach(() => {
  fixture.filters = [];
  fixture.rows = [
    [{ id: "property", title: "Tower", floorCount: 80, unitsPerFloor: 25 }],
    [{ id: "granted-floor", label: "Floor 1", level: 1, imageStorageKey: null }],
    [
      {
        id: "granted-unit",
        floorId: "granted-floor",
        code: "1A",
        status: "available",
        imageStorageKey: null,
      },
    ],
  ];
});

it.each([getPropertyInventory, getPropertyInventoryForGrants])(
  "returns granted inventory without totals or omitted counts",
  async (load) => {
    const context = {
      authUserId: "auth",
      userId: "user",
      organizationId: "org",
      roles: ["broker"],
      permissions: new Set(["properties.view", "properties.grant_unit_access"]),
    };
    const result = await load(context, "property");
    expect(result.floors).toHaveLength(1);
    expect(result.floors[0].unitCount).toBe(1);
    expect(result.units).toHaveLength(1);
    expect(result).not.toHaveProperty("omitted");
    const queries = fixture.filters.map((condition) => new PgDialect().sqlToQuery(condition));
    expect(queries[1].params).toContain("granted-floor");
    expect(queries[2].params).toContain("granted-unit");
    // Unit types are read for this property only.
    expect(queries[3].params).toContain("property");
    expect(queries).toHaveLength(4);
  },
);
