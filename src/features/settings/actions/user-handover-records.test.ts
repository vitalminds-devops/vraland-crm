import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  auditLogs,
  contacts,
  dealAgents,
  deals,
  propertyViewings,
  tasks,
  userRoles,
  users,
} from "@/db/schema";

// Reads and returned rows are keyed by table, so the order of reads doesn't matter here.
const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  rows: new Map<unknown, unknown[]>(),
  returned: new Map<unknown, unknown[]>(),
  dealCounts: [] as unknown[],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  inserts: [] as { table: unknown; values: unknown }[],
  // Tables deleted from with returning.
  deletes: [] as unknown[],
}));
function query(rows: () => unknown) {
  const chain: Record<string, unknown> = {};
  let table: unknown;
  chain.from = (from: unknown) => ((table = from), chain);
  chain.where = (condition: unknown) => {
    if (table === deals) mocks.dealCounts.push(condition);
    return chain;
  };
  for (const name of ["innerJoin", "limit", "for"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows() ?? mocks.rows.get(table) ?? []).then(resolve);
  return chain;
}
function written(table: unknown) {
  const done = Promise.resolve([]);
  return Object.assign(done, { returning: async () => mocks.returned.get(table) ?? [] });
}
vi.mock("@/db", () => ({
  db: {
    select: () => query(() => mocks.reads.shift() ?? []),
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => query(() => undefined),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => {
            mocks.updates.push({ table, values });
            return { where: () => written(table) };
          },
        }),
        insert: (table: unknown) => ({
          values: (values: unknown) => {
            mocks.inserts.push({ table, values });
            return Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [] });
          },
        }),
        delete: (table: unknown) => ({
          where: () =>
            Object.assign(Promise.resolve([]), {
              returning: async () => (mocks.deletes.push(table), mocks.returned.get(table) ?? []),
            }),
        }),
      }),
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  canAssignRoles: async () => true,
  canChangeUser: async () => true,
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor", roles: [] })),
  requireAuthorizationContext: vi.fn(),
}));
vi.mock("@/lib/permissions/policy", () => ({
  canManageUsers: () => true,
  hasPermission: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => "hash" }));
import { setUserStatus } from "./settings.actions";

const leaving = "00000000-0000-4000-8000-000000000001";
const receiver = "00000000-0000-4000-8000-000000000002";
const deal = "00000000-0000-4000-8000-0000000000d1";

beforeEach(() => {
  mocks.updates = [];
  mocks.inserts = [];
  mocks.deletes = [];
  mocks.dealCounts = [];
  // The user being changed, then "not a Super Administrator".
  mocks.reads = [[{ id: leaving, status: "active", deletedAt: null }], []];
  mocks.rows = new Map<unknown, unknown[]>([
    [users, [{ id: receiver, brokerId: null, canBroker: true, n: 0 }]],
    [userRoles, [{ userId: receiver, slug: "broker" }]],
    [contacts, [{ n: 1 }]],
    [deals, [{ id: deal, brokerUserId: null, n: 1 }]],
    [tasks, [{ n: 1 }]],
    [propertyViewings, [{ n: 1 }]],
  ]);
  mocks.returned = new Map<unknown, unknown[]>([
    [contacts, [{ id: "contact" }]],
    [deals, [{ id: "brokered-deal" }]],
    [tasks, [{ id: "task" }]],
    [propertyViewings, [{ id: "viewing", eventId: "event" }]],
  ]);
});

const handOver = () =>
  setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver });
const audited = (entityType: string) =>
  mocks.inserts
    .filter((insert) => insert.table === auditLogs && Array.isArray(insert.values))
    .flatMap((insert) => insert.values as Record<string, unknown>[])
    .filter((row) => row.entityType === entityType);

it("audits moved contacts, broker-only deals, tasks and viewings", async () => {
  expect((await handOver()).success).toBe(true);
  expect(audited("contact")).toEqual([
    expect.objectContaining({
      action: "update",
      actorUserId: "actor",
      entityId: "contact",
      newValues: expect.objectContaining({ assignedUserId: receiver }),
    }),
    expect.objectContaining({ entityId: "contact", newValues: { brokerUserId: receiver } }),
  ]);
  expect(audited("deal")).toContainEqual(
    expect.objectContaining({
      entityId: "brokered-deal",
      oldValues: { brokerUserId: leaving },
      newValues: { brokerUserId: receiver },
    }),
  );
  expect(audited("task")).toEqual([
    expect.objectContaining({ entityId: "task", newValues: { assignedUserId: receiver } }),
  ]);
  expect(audited("property_viewing")).toEqual([
    expect.objectContaining({ entityId: "viewing", newValues: { agentUserId: receiver } }),
  ]);
  const brokerOnly = mocks.updates.find(
    (u) => u.table === deals && !("primaryAgentUserId" in u.values),
  );
  expect(brokerOnly?.values).toMatchObject({ brokerUserId: receiver, updatedBy: "actor" });
});

it("swaps the leaver's co-agent rows to the receiver and drops the ones already covered", async () => {
  mocks.returned.set(dealAgents, [{ dealId: deal, role: "co_agent" }]);
  expect((await handOver()).success).toBe(true);
  expect(mocks.updates.find((u) => u.table === dealAgents)?.values).toEqual({ userId: receiver });
  expect(mocks.deletes).toContain(dealAgents);
  // The mock returns the same row for the swap and the drop, so both kinds of audit show.
  expect(audited("deal")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityId: deal,
        oldValues: { agentUserId: leaving, role: "co_agent" },
        newValues: { agentUserId: receiver, role: "co_agent" },
      }),
      expect.objectContaining({
        entityId: deal,
        oldValues: { agentUserId: leaving, role: "co_agent" },
        newValues: null,
      }),
    ]),
  );
});

it("counts open deals where the leaver is only a co-agent in the prompt", async () => {
  mocks.rows.set(contacts, [{ n: 0 }]);
  mocks.rows.set(tasks, [{ n: 0 }]);
  mocks.rows.set(propertyViewings, [{ n: 0 }]);
  expect(await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: "" })).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        message: "Choose who takes over their 1 open opportunity.",
      }),
    }),
  );
  const [count] = mocks.dealCounts;
  expect(new PgDialect().sqlToQuery(count as SQL).sql).toContain(
    `exists (select 1 from "deal_agents" a where a."deal_id" = "deals"."id"`,
  );
});
