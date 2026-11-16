import { beforeEach, expect, it, vi } from "vitest";
import { auditLogs, developments, properties } from "@/db/schema";
import { requirePermission } from "@/lib/permissions/authorization";
import { deleteDevelopment } from "./development-delete.actions";

const id = "10000000-0000-4000-8000-000000000001";
const mock = vi.hoisted(() => ({
  development: null as { name: string; code: string; cover: string | null } | null,
  used: new Set<unknown>(),
  locks: [] as unknown[],
  deleted: [] as unknown[],
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  removed: [] as string[],
  revalidated: [] as string[],
}));

vi.mock("@/db", () => ({
  db: {
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => ({
          from: (table: unknown) => ({
            where: () => ({
              for: async () => {
                mock.locks.push(table);
                return mock.development ? [mock.development] : [];
              },
              limit: async () => (mock.used.has(table) ? [{ id: "row" }] : []),
            }),
          }),
        }),
        delete: (table: unknown) => ({ where: async () => mock.deleted.push(table) }),
        insert: (table: unknown) => ({
          values: async (values: Record<string, unknown>) => mock.inserts.push({ table, values }),
        }),
      }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => mock.revalidated.push(path) }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ remove: async (key: string) => mock.removed.push(key) }),
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "organization", userId: "admin" })),
}));

beforeEach(() => {
  mock.development = { name: "Vista", code: "VST", cover: "org/developments/x/cover/a.jpg" };
  mock.used = new Set();
  mock.locks = [];
  mock.deleted = [];
  mock.inserts = [];
  mock.removed = [];
  mock.revalidated = [];
});

it("deletes an empty development, its cover and records who did it", async () => {
  expect(await deleteDevelopment(id)).toEqual({ success: true, data: undefined });
  expect(requirePermission).toHaveBeenCalledWith("developments.delete");
  expect(mock.locks).toEqual([developments]);
  expect(mock.deleted).toEqual([developments]);
  expect(mock.inserts.find((write) => write.table === auditLogs)?.values).toMatchObject({
    action: "delete",
    entityType: "development",
    entityId: id,
    oldValues: { name: "Vista", code: "VST" },
  });
  expect(mock.removed).toEqual(["org/developments/x/cover/a.jpg"]);
  expect(mock.revalidated).toEqual(["/developments"]);
});

it("refuses while properties still belong to it", async () => {
  mock.used.add(properties);
  expect(await deleteDevelopment(id)).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("Remove its properties first") },
  });
  expect(mock.deleted).toEqual([]);
  expect(mock.removed).toEqual([]);
});

it("reports not found for a development in another organization", async () => {
  mock.development = null;
  expect(await deleteDevelopment(id)).toMatchObject({
    success: false,
    error: { code: "RESOURCE_NOT_FOUND" },
  });
  expect(mock.deleted).toEqual([]);
});

it("refuses without the permission", async () => {
  vi.mocked(requirePermission).mockRejectedValueOnce(new Error("Forbidden"));
  await expect(deleteDevelopment(id)).rejects.toThrow("Forbidden");
  expect(mock.locks).toEqual([]);
  expect(mock.deleted).toEqual([]);
});
