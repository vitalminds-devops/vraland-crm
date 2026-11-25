import { beforeEach, expect, it, vi } from "vitest";
import { units } from "@/db/schema";
import { setUnitStatus } from "./unit.actions";

const unitId = "12345678-1234-4234-8234-123456789abc";

const mock = vi.hoisted(() => ({
  reservedDealId: null as string | null,
  deal: null as { code: string; status: string } | null,
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
}));

/** A select chain that ends in `limit` or `for`, both resolving to `rows()`. */
const chain = (rows: () => unknown[]) => {
  const c = {
    from: () => c,
    innerJoin: () => c,
    where: () => c,
    limit: async () => rows(),
    for: async () => rows(),
  };
  return c;
};

vi.mock("@/db", () => ({
  db: {
    // loadUnit
    select: () =>
      chain(() => [{ id: unitId, code: "5A", status: "deposit_paid", buildingId: "building" }]),
    transaction: async (work: (tx: unknown) => unknown) => {
      let reads = 0;
      return work({
        // First the locked unit, then the deal holding it.
        select: () =>
          chain(() =>
            reads++ === 0
              ? [{ reservedDealId: mock.reservedDealId }]
              : mock.deal
                ? [mock.deal]
                : [],
          ),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => {
            mock.updates.push({ table, values });
            return { where: async () => {} };
          },
        }),
        insert: () => ({ values: async () => {} }),
      });
    },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "organization", userId: "admin" }),
}));
vi.mock("@/lib/storage/document-storage", () => ({ getDocumentStorage: vi.fn() }));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: async () => true }));

beforeEach(() => {
  mock.reservedDealId = null;
  mock.deal = null;
  mock.updates = [];
});

it.each(["open", "won"])("refuses a unit an %s opportunity still holds", async (status) => {
  mock.reservedDealId = "deal";
  mock.deal = { code: "DEAL-1", status };
  expect(await setUnitStatus(unitId, "available")).toEqual({
    success: false,
    message: "Unit 5A belongs to opportunity DEAL-1. Change it from that opportunity.",
  });
  expect(mock.updates).toEqual([]);
});

it("drops a lost opportunity's hold when the unit is sold by hand", async () => {
  mock.reservedDealId = "deal";
  mock.deal = { code: "DEAL-1", status: "lost" };
  expect((await setUnitStatus(unitId, "sold")).success).toBe(true);
  expect(mock.updates.find((u) => u.table === units)?.values).toMatchObject({
    status: "sold",
    reservedDealId: null,
  });
});

it("frees a unit left behind by a lost opportunity", async () => {
  mock.reservedDealId = "deal";
  mock.deal = { code: "DEAL-1", status: "lost" };
  expect((await setUnitStatus(unitId, "available")).success).toBe(true);
  expect(mock.updates.find((u) => u.table === units)?.values).toMatchObject({
    status: "available",
    reservedDealId: null,
  });
});

it("changes a unit no opportunity holds", async () => {
  expect((await setUnitStatus(unitId, "inactive")).success).toBe(true);
});
