import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reachable: true,
  set: vi.fn(),
  returned: [] as unknown[],
}));
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "values"]) chain[name] = () => chain;
  chain.limit = async () => [{ id: "user", title: "Old" }];
  chain.set = (values: unknown) => (mocks.set(values), chain);
  chain.returning = async () => mocks.returned;
  chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  const db = { select: () => chain, update: () => chain, insert: () => chain };
  return { db: { ...db, transaction: async (work: (tx: unknown) => unknown) => work(db) } };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor" })),
  canAccessResource: vi.fn(async () => mocks.reachable),
}));
vi.mock("@/lib/permissions/property-access", () => ({ grantedPropertyCondition: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
import { deleteTask, updateTask } from "./task.actions";

const id = "7d2f4a52-0c1e-4c39-9d3b-2c4b6f1b9a10";
const blank = { assignedUserId: "", contactId: "", propertyId: "", dealId: "", reminderAt: "" };
const input = {
  ...blank,
  title: "Call Ana",
  taskType: "call",
  priority: "high",
  dueAt: "2026-11-10T09:00",
};

beforeEach(() => {
  mocks.reachable = true;
  mocks.set.mockReset();
  mocks.returned = [{ title: "Call Ana", contactId: null, dealId: null }];
});

it("saves the due time as Manila wall-clock time", async () => {
  expect(await updateTask(id, input)).toMatchObject({ success: true });
  expect(mocks.set.mock.calls[0][0].dueAt).toEqual(new Date("2026-11-10T01:00:00Z"));
});

it("refuses to edit or delete a task outside the user's reach", async () => {
  mocks.reachable = false;
  expect(await updateTask(id, input)).toMatchObject({ success: false });
  expect(await deleteTask(id)).toMatchObject({ success: false });
  expect(mocks.set).not.toHaveBeenCalled();
});

it("soft-deletes a task", async () => {
  expect((await deleteTask(id)).success).toBe(true);
  expect(mocks.set.mock.calls[0][0].deletedAt).toBeInstanceOf(Date);
});
