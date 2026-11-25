import { beforeEach, expect, it, vi } from "vitest";
import { deleteUnitType } from "./unit-type.actions";

const typeId = "88f50ab3-567a-4a37-9271-eaa92a221995";

const db = vi.hoisted(() => ({ unitsUsing: 0, deleted: false }));
vi.mock("@/db", () => {
  // Every query chains; awaiting one resolves to what the step needs.
  const query = (rows: () => unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === "then"
            ? (resolve: (value: unknown) => void) => resolve(rows())
            : () => query(rows),
      },
    );
  return {
    db: {
      select: () => query(() => [{ id: typeId, propertyId: "property", name: "2BR" }]),
      transaction: async (work: (tx: unknown) => unknown) =>
        work({
          select: (columns: Record<string, unknown>) =>
            query(() => ("value" in columns ? [{ value: db.unitsUsing }] : [{ id: typeId }])),
          delete: () => ({ where: async () => void (db.deleted = true) }),
          insert: () => ({ values: async () => {} }),
        }),
    },
  };
});
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "org", userId: "user" }),
}));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: async () => true }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  db.unitsUsing = 0;
  db.deleted = false;
});

it("refuses to remove a unit type while units use it, saying how many", async () => {
  db.unitsUsing = 12;
  const result = await deleteUnitType(typeId);
  expect(!result.success && result.error.message).toBe(
    "12 units use 2BR. Remove them in Design floor or give them another type first.",
  );
  expect(db.deleted).toBe(false);
});

it("removes a unit type nobody uses, and refuses a malformed id", async () => {
  expect((await deleteUnitType(typeId)).success).toBe(true);
  expect(db.deleted).toBe(true);
  expect((await deleteUnitType("not-an-id")).success).toBe(false);
});
