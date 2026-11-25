import { beforeEach, expect, it, vi } from "vitest";
import { activities, auditLogs, properties } from "@/db/schema";
import { canWriteProperty } from "../queries/property-scope.queries";
import { archiveProperty, restoreProperty } from "./property.actions";

const mock = vi.hoisted(() => ({
  openDeals: [] as { code: string }[],
  /** What the property update returns: the row, or nothing when it was already in that state. */
  updated: [{ title: "Tower 2" }] as { title: string }[],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  revalidated: [] as string[],
}));

vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: () => ({
            where: () => ({ limit: async () => mock.openDeals, for: async () => [] }),
          }),
        }),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => {
            mock.updates.push({ table, values });
            return { where: () => ({ returning: async () => mock.updated }) };
          },
        }),
        insert: (table: unknown) => ({
          values: async (values: Record<string, unknown>) => {
            mock.inserts.push({ table, values });
          },
        }),
      }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mock.revalidated.push(path) }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "organization", userId: "admin" })),
}));
vi.mock("@/lib/permissions/policy", () => ({ hasUnrestrictedInventoryAccess: () => true }));
vi.mock("../queries/property-scope.queries", () => ({ canWriteProperty: vi.fn(async () => true) }));
vi.mock("../lib/parking-sync", () => ({ syncParkingCount: vi.fn() }));

beforeEach(() => {
  vi.mocked(canWriteProperty).mockResolvedValue(true);
  mock.openDeals = [];
  mock.updated = [{ title: "Tower 2" }];
  mock.updates = [];
  mock.inserts = [];
  mock.revalidated = [];
});

it("archives the property and records who did it", async () => {
  expect(await archiveProperty("property")).toEqual({ success: true, id: "property" });
  const update = mock.updates.find((write) => write.table === properties)!.values;
  expect(update.deletedAt).toBeInstanceOf(Date);
  expect(update.updatedBy).toBe("admin");
  expect(mock.inserts.find((write) => write.table === activities)?.values).toMatchObject({
    activityType: "property.archived",
    summary: "Tower 2 was archived.",
    propertyId: "property",
  });
  expect(mock.inserts.find((write) => write.table === auditLogs)?.values).toMatchObject({
    action: "delete",
    entityType: "property",
    entityId: "property",
  });
  expect(mock.revalidated).toEqual(["/properties", "/properties/archive"]);
});

it("refuses while open opportunities still use the property, naming them", async () => {
  mock.openDeals = [{ code: "DEAL-1" }, { code: "DEAL-2" }];
  expect(await archiveProperty("property")).toEqual({
    success: false,
    message: "Still used by open opportunities: DEAL-1, DEAL-2. Close or win them first.",
  });
  expect(mock.updates).toEqual([]);
});

it("names at most three opportunities", async () => {
  mock.openDeals = ["A", "B", "C", "D"].map((code) => ({ code }));
  const result = await archiveProperty("property");
  expect(result).toMatchObject({ success: false });
  expect("message" in result && result.message).toBe(
    "Still used by open opportunities: A, B, C and more. Close or win them first.",
  );
});

it("reports a property that was already archived", async () => {
  mock.updated = [];
  expect(await archiveProperty("property")).toEqual({
    success: false,
    message: "Property was already archived.",
  });
  expect(mock.inserts).toEqual([]);
});

it("does nothing outside the person's scope", async () => {
  vi.mocked(canWriteProperty).mockResolvedValue(false);
  expect((await archiveProperty("property")).success).toBe(false);
  expect(mock.updates).toEqual([]);
});

it("restores an archived property and checks the archived scope", async () => {
  expect(await restoreProperty("property")).toEqual({ success: true, id: "property" });
  expect(canWriteProperty).toHaveBeenCalledWith(expect.anything(), "property", { archived: true });
  expect(mock.updates[0].values.deletedAt).toBeNull();
  expect(mock.inserts.find((write) => write.table === auditLogs)?.values).toMatchObject({
    action: "restore",
    newValues: { deletedAt: null },
  });
  expect(mock.revalidated).toContain("/properties/property");
});

it("reports a property that is not archived", async () => {
  mock.updated = [];
  expect(await restoreProperty("property")).toEqual({
    success: false,
    message: "Property is not archived.",
  });
});
