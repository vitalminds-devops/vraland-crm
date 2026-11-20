import { beforeEach, expect, it, vi } from "vitest";
import { automationEnrollments, contacts, propertyViewings, tasks } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  txReads: [] as unknown[][],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
}));
vi.mock("@/db", () => {
  const query = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "innerJoin", "limit"]) chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  };
  return {
    db: {
      transaction: async (work: (tx: unknown) => unknown) =>
        work({
          select: () => query(mocks.txReads.shift() ?? []),
          update: (table: unknown) => ({
            set: (values: Record<string, unknown>) => {
              mocks.updates.push({ table, values });
              return { where: async () => [] };
            },
          }),
          insert: () => ({ values: async () => [] }),
        }),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor" })),
  canAccessResource: vi.fn(async () => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { archiveContact } from "./contact.actions";

const contact = { id: "contact", firstName: "Ana", lastName: "Cruz", deletedAt: null };

beforeEach(() => {
  mocks.updates = [];
});

it("refuses while the contact's deal still holds units or payments", async () => {
  mocks.txReads = [[contact], [{ code: "DEAL-7" }]];
  expect(await archiveContact("contact")).toMatchObject({
    success: false,
    error: {
      message:
        "Cannot archive this contact: opportunity DEAL-7 has selected units, parking slots, or recorded payments. Review it in Sales pipeline first.",
    },
  });
  expect(mocks.updates).toEqual([]);
});

it("archives the contact and closes its open tasks, sequences and upcoming viewings", async () => {
  mocks.txReads = [[contact], []];
  expect((await archiveContact("contact")).success).toBe(true);
  expect(mocks.updates.map((u) => [u.table, u.values.status])).toEqual([
    [contacts, undefined],
    [tasks, "cancelled"],
    [automationEnrollments, "cancelled"],
    [propertyViewings, "cancelled"],
  ]);
});
