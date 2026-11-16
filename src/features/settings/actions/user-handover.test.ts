import { beforeEach, expect, it, vi } from "vitest";
import { contacts, deals, tasks, users } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  txReads: [] as unknown[][],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
}));
function query(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "innerJoin", "limit"]) chain[name] = () => chain;
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
          values: () => Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [] }),
        }),
        delete: () => ({ where: async () => [] }),
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
import { setUserDeleted, setUserStatus } from "./settings.actions";

const leaving = "00000000-0000-4000-8000-000000000001";
const receiver = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  mocks.updates = [];
  // The user being changed, then "not a Super Administrator".
  mocks.reads = [[{ id: leaving, status: "active", deletedAt: null }], []];
});

it("refuses to deactivate someone with open work when nobody takes it over", async () => {
  mocks.txReads = [[{ n: 3 }], [{ n: 1 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];
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
    [{ n: 2 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver }],
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
  mocks.txReads = [[{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];
  expect((await setUserDeleted({ id: leaving, deleted: true })).success).toBe(true);
  expect(mocks.updates.map((u) => u.table)).toEqual([users]);
});

it("restores an archived user without a handover", async () => {
  mocks.reads = [[{ id: leaving, deletedAt: new Date() }], []];
  expect((await setUserDeleted({ id: leaving, deleted: false })).success).toBe(true);
});

const lead = leaving;
const member = "00000000-0000-4000-8000-000000000003";

it("refuses to hand a team to someone their roles can't report to", async () => {
  mocks.txReads = [
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
    [{ n: 1 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: receiversBroker }],
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
  mocks.txReads = [[{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 2 }], [{ n: 1 }]];
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
    [{ n: 0 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ n: 1 }],
    [{ n: 0 }],
    [{ id: receiver, brokerId: null }],
    [{ id: "deal", brokerUserId: null }],
  ];
  expect(
    (await setUserStatus({ id: leaving, status: "inactive", handoverToUserId: receiver })).success,
  ).toBe(true);
  expect(mocks.updates.find((u) => u.table === tasks)?.values.assignedUserId).toBe(receiver);
});
