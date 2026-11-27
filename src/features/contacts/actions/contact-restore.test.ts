import { beforeEach, expect, it, vi } from "vitest";
import { auditLogs, contacts } from "@/db/schema";

const oldAgent = "11111111-1111-4111-8111-111111111111";
const oldBroker = "22222222-2222-4222-8222-222222222222";
const newAgent = "33333333-3333-4333-8333-333333333333";
const newBroker = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  inactive: new Set<string>(),
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  inserts: [] as { table: unknown; values: Record<string, unknown> }[],
  moves: [] as unknown[],
}));
vi.mock("@/db", () => {
  const query = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "innerJoin", "limit"]) chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  };
  const select = () => query(mocks.reads.shift() ?? []);
  return {
    db: {
      select,
      transaction: async (work: (tx: unknown) => unknown) =>
        work({
          select,
          update: (table: unknown) => ({
            set: (values: Record<string, unknown>) => {
              mocks.updates.push({ table, values });
              return { where: async () => [] };
            },
          }),
          insert: (table: unknown) => ({
            values: async (values: Record<string, unknown>) =>
              void mocks.inserts.push({ table, values }),
          }),
        }),
    },
  };
});
vi.mock("@/lib/permissions/active-assignees", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/active-assignees")>();
  return {
    ...actual,
    lockActiveAssignees: vi.fn(async (_tx: unknown, _org: string, ids: string[]) => {
      if (ids.some((id) => mocks.inactive.has(id))) throw new actual.InactiveAssigneeError();
    }),
  };
});
vi.mock("@/features/deals/lib/move-open-deals", () => ({
  moveOpenDeals: vi.fn(async (_tx: unknown, input: unknown) => void mocks.moves.push(input)),
}));
vi.mock("../lib/contact-duplicate-lookup", () => ({ findDuplicateMatch: vi.fn(async () => null) }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({
    organizationId: "org",
    userId: "actor",
    permissions: new Set(["contacts.delete", "contacts.reassign_broker"]),
  })),
  canAccessResource: vi.fn(async () => true),
}));
vi.mock("@/lib/permissions/policy", () => ({ hasOrganizationWideAccess: () => true }));
vi.mock("@/lib/permissions/scope", () => ({
  dataScopeCondition: () => undefined,
  scopedAgentCondition: () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { restoreContact } from "./contact.actions";

const archived = {
  id: "contact",
  firstName: "Ana",
  lastName: "Cruz",
  deletedAt: new Date("2026-11-01T00:00:00Z"),
  expiredAt: null,
  agentUserId: oldAgent,
  brokerUserId: oldBroker,
};
const contactUpdate = () => mocks.updates.find((u) => u.table === contacts)?.values;
const audit = () => mocks.inserts.find((i) => i.table === auditLogs)?.values;

beforeEach(() => {
  mocks.reads = [];
  mocks.inactive = new Set();
  mocks.updates = [];
  mocks.inserts = [];
  mocks.moves = [];
});

it("restores with an active agent and leaves the owner alone", async () => {
  mocks.reads = [[archived]];
  expect((await restoreContact("contact")).success).toBe(true);
  expect(contactUpdate()).toMatchObject({
    deletedAt: null,
    agentUserId: oldAgent,
    brokerUserId: oldBroker,
  });
  expect(audit()).toMatchObject({ oldValues: { deletedAt: expect.any(String) } });
  expect(audit()?.newValues).toEqual({ deletedAt: null });
  expect(mocks.moves).toEqual([]);
});

it("refuses when the agent left and no new agent is given", async () => {
  mocks.inactive = new Set([oldAgent]);
  mocks.reads = [[archived]];
  expect(await restoreContact("contact")).toMatchObject({
    success: false,
    error: { details: { needsAgent: true } },
  });
  expect(mocks.updates).toEqual([]);
});

it("moves agent, broker and open deals to an eligible new agent", async () => {
  mocks.inactive = new Set([oldAgent, oldBroker]);
  mocks.reads = [[{ id: newAgent }], [archived], [{ brokerId: newBroker }]];
  expect((await restoreContact("contact", newAgent)).success).toBe(true);
  expect(contactUpdate()).toMatchObject({ agentUserId: newAgent, brokerUserId: newBroker });
  expect(mocks.moves).toEqual([
    expect.objectContaining({ agentUserId: newAgent, brokerUserId: newBroker }),
  ]);
  expect(audit()).toMatchObject({
    oldValues: { agentUserId: oldAgent, brokerUserId: oldBroker },
    newValues: { deletedAt: null, agentUserId: newAgent, brokerUserId: newBroker },
  });
});

it("re-derives only the broker when the agent is active but the broker left", async () => {
  mocks.inactive = new Set([oldBroker]);
  mocks.reads = [[archived], [{ brokerId: newBroker }]];
  expect((await restoreContact("contact")).success).toBe(true);
  expect(contactUpdate()).toMatchObject({ agentUserId: oldAgent, brokerUserId: newBroker });
  expect(mocks.moves).toEqual([expect.objectContaining({ brokerUserId: newBroker })]);
  expect(mocks.moves[0]).not.toHaveProperty("agentUserId");
});

it("refuses a new agent who is not active", async () => {
  mocks.inactive = new Set([oldAgent, newAgent]);
  // Passed the eligibility check, then left before the restore locked them.
  mocks.reads = [[{ id: newAgent }], [archived]];
  expect(await restoreContact("contact", newAgent)).toMatchObject({
    success: false,
    error: { message: "Select an active agent." },
  });
  expect(mocks.updates).toEqual([]);
});

it("refuses a new agent outside eligibility or scope", async () => {
  mocks.reads = [[]];
  expect(await restoreContact("contact", newAgent)).toMatchObject({ success: false });
  expect(mocks.updates).toEqual([]);
});
