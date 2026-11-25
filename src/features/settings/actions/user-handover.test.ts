import { beforeEach, expect, it, vi } from "vitest";
import { contacts, deals, tasks, users } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  txReads: [] as unknown[][],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  inserts: [] as unknown[],
}));
function query(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "innerJoin", "limit", "for"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}
vi.mock("@/db", () => ({
  db: {
    select: () => query(mocks.reads.shift() ?? []),
    transaction: async (work: (tx: unknown) => unknown) =>
      work({
        select: () => query(mocks.txReads.shift() ?? []),
        update: (table: unknown) => ({
          set: (values: Record<string, unknown>) => {
            mocks.updates.push({ table, values });
            const done = Promise.resolve([]);
            return { where: () => Object.assign(done, { returning: async () => [] }) };
          },
        }),
        insert: () => ({
          values: (values: unknown) => {
            mocks.inserts.push(values);
            return Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [] });
          },
        }),
        delete: () => ({
          where: () => Object.assign(Promise.resolve([]), { returning: async () => [] }),
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
  hasPermission: vi.fn(() => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("better-auth/crypto", () => ({ hashPassword: async () => "hash" }));
import { setUserDeleted, setUserStatus } from "./settings.actions";

const leaving = "00000000-0000-4000-8000-000000000001";
const receiver = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mocks.updates = [];
  mocks.inserts = [];
  mocks.txReads = [];
  // The user being changed, then "not a Super Administrator".
  mocks.reads = [[{ id: leaving, status: "active", deletedAt: null }], []];
});

it("refuses to deactivate someone with open work when nobody takes it over", async () => {
  mocks.txReads = [[{ id: leaving }], [{ n: 3 }], [{ n: 1 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];
  expect(await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: "" })).toEqual(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        message: "Choose who takes over their 3 contacts, 1 open deal.",
      }),
    }),
  );
  expect(mocks.updates).toEqual([]);
});

it("hands contacts, deals and team to the chosen user, then deactivates", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 2 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver }],
    [],
    [{ id: "deal", brokerUserId: null }],
  ];
  expect(
    (await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  const tables = mocks.updates.map((u) => u.table);
  expect(tables.filter((t) => t === contacts)).toHaveLength(2);
  expect(tables.filter((t) => t === deals)).toHaveLength(2);
  expect(mocks.updates.find((u) => u.table === users && u.values.status)?.values.status).toBe(
    "inactive",
  );
});

it("archives someone with no open work without asking for a handover", async () => {
  mocks.txReads = [[{ id: leaving }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];
  expect((await setUserDeleted({ id: leaving, deleted: true })).success).toBe(true);
  expect(mocks.updates.map((u) => u.table)).toEqual([users]);
});

it("restores an archived user without a handover", async () => {
  mocks.reads = [[{ id: leaving, deletedAt: new Date() }], []];
  expect((await setUserDeleted({ id: leaving, deleted: false })).success).toBe(true);
});

const oldBroker = "00000000-0000-4000-8000-000000000008";
const userWrite = () => mocks.updates.find((u) => u.table === users)?.values;
const auditRow = () => mocks.inserts.at(-1) as Record<string, Record<string, unknown>>;

it("restores as inactive and drops a broker who is no longer active", async () => {
  mocks.reads = [[{ id: leaving, status: "active", deletedAt: new Date() }], []];
  mocks.txReads = [[{ brokerId: oldBroker, brokerActive: false }]];
  expect((await setUserDeleted({ id: leaving, deleted: false })).success).toBe(true);
  expect(userWrite()).toMatchObject({ deletedAt: null, status: "inactive", brokerId: null });
  expect(auditRow().oldValues).toMatchObject({ status: "active", brokerId: oldBroker });
  expect(auditRow().newValues).toMatchObject({ status: "inactive", brokerId: null });
});

it("restores and keeps an active broker", async () => {
  mocks.reads = [[{ id: leaving, status: "active", deletedAt: new Date() }], []];
  mocks.txReads = [[{ brokerId: oldBroker, brokerActive: true }]];
  expect((await setUserDeleted({ id: leaving, deleted: false })).success).toBe(true);
  expect(userWrite()).toMatchObject({ status: "inactive" });
  expect(userWrite()).not.toHaveProperty("brokerId");
  expect(auditRow().newValues).not.toHaveProperty("brokerId");
});

it("reactivates and drops an archived broker", async () => {
  mocks.reads = [[{ id: leaving, status: "inactive", deletedAt: null }], []];
  mocks.txReads = [[{ brokerId: oldBroker, brokerActive: false }]];
  expect((await setUserStatus({ id: leaving, status: "active" })).success).toBe(true);
  expect(userWrite()).toMatchObject({ status: "active", brokerId: null });
  expect(auditRow().oldValues).toEqual({ status: "inactive", brokerId: oldBroker });
});

it("reactivates and keeps a valid broker", async () => {
  mocks.reads = [[{ id: leaving, status: "inactive", deletedAt: null }], []];
  mocks.txReads = [[{ brokerId: oldBroker, brokerActive: true }]];
  expect((await setUserStatus({ id: leaving, status: "active" })).success).toBe(true);
  expect(userWrite()).not.toHaveProperty("brokerId");
  expect(auditRow().oldValues).toEqual({ status: "inactive" });
});

const lead = leaving;
const member = "00000000-0000-4000-8000-000000000003";

it("refuses to hand a team to someone their roles can't report to", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: null }],
    [
      { id: lead, brokerId: null },
      { id: receiver, brokerId: null },
      { id: member, brokerId: lead },
    ],
    [
      { userId: receiver, slug: "sales-director-ih" },
      { userId: member, slug: "sales-executive" },
    ],
  ];
  expect(await setUserStatus({ id: lead, status: "inactive", handoverToUserId: receiver })).toEqual(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        message:
          "Some of their team can't report to the person taking over. Reassign them first, or choose someone else.",
      }),
    }),
  );
  expect(mocks.updates).toEqual([]);
});

it("lets a team member take over: they lead the team and report to nobody", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 2 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: lead }],
    [
      { id: lead, brokerId: null },
      { id: receiver, brokerId: lead },
      { id: member, brokerId: lead },
    ],
    [
      { userId: receiver, slug: "broker" },
      { userId: member, slug: "agent" },
    ],
  ];
  expect(
    (await setUserStatus({ id: lead, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  const brokerWrites = mocks.updates
    .filter((u) => u.table === users && "brokerId" in u.values)
    .map((u) => u.values.brokerId);
  expect(brokerWrites).toEqual([receiver, null]);
});

it("gives handed-over records the receiver's own broker", async () => {
  const receiversBroker = "00000000-0000-4000-8000-000000000009";
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 1 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: receiversBroker }],
    [],
    [{ id: "deal", brokerUserId: "old-broker" }],
  ];
  expect(
    (await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  const assigned = mocks.updates.find((u) => u.table === contacts && "assignedUserId" in u.values);
  expect(assigned?.values).toMatchObject({
    assignedUserId: receiver,
    brokerUserId: receiversBroker,
  });
  const dealMove = mocks.updates.find((u) => u.table === deals && "primaryAgentUserId" in u.values);
  expect(dealMove?.values).toMatchObject({
    primaryAgentUserId: receiver,
    brokerUserId: receiversBroker,
  });
});

it("names open tasks and upcoming viewings in the handover prompt", async () => {
  mocks.txReads = [[{ id: leaving }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 2 }], [{ n: 1 }]];
  expect(await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: "" })).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        message: "Choose who takes over their 2 open tasks, 1 upcoming viewing.",
      }),
    }),
  );
});

it("moves open tasks and the deal's primary agent row to the receiver", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 0 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: null }],
    [],
    [{ id: "deal", brokerUserId: null }],
  ];
  expect(
    (await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  expect(mocks.updates.find((u) => u.table === tasks)?.values.assignedUserId).toBe(receiver);
});

it("refuses a receiver who isn't an active agent or broker", async () => {
  // The receiver query finds nobody: an admin or finance user fails the agent rule.
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [],
  ];
  expect(
    await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver }),
  ).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        message: "The person taking over must be an active agent or broker.",
      }),
    }),
  );
  expect(mocks.updates).toEqual([]);
});

it("refuses to hand brokered records to someone who can't broker", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 1 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: null, canBroker: false }],
    [{ id: leaving }],
  ];
  expect(
    await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver }),
  ).toEqual(
    expect.objectContaining({
      error: expect.objectContaining({
        message: "The person taking over can't be a broker for their records. Choose a broker.",
      }),
    }),
  );
  expect(mocks.updates).toEqual([]);
});

it("hands brokered records to a broker", async () => {
  mocks.txReads = [
    [{ id: leaving }],
    [{ n: 1 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: null, canBroker: true }],
    [],
  ];
  expect(
    (await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  expect(
    mocks.updates.filter((u) => u.table === contacts).map((u) => u.values.brokerUserId),
  ).toContain(receiver);
});
