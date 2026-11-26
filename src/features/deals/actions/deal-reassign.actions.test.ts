import { beforeEach, expect, it, vi } from "vitest";
import { reassignDealAgent } from "./deal-reassign.actions";

const dealId = "12345678-1234-4234-8234-123456789abc";
const agentUserId = "22345678-1234-4234-8234-123456789abc";
const fixture = vi.hoisted(() => ({
  permissions: new Set<string>(["deals.reassign_agent"]),
  agentEligible: true,
  status: "open",
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
  deletes: 0,
  /** The new agent's broker; null when they have none. */
  newBroker: "new-broker" as string | null,
}));

function query(rows: () => unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    limit: () => q,
    orderBy: () => q,
    for: async () => rows(),
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows()).then(resolve),
  };
  return q;
}

vi.mock("@/db", () => ({
  db: {
    // The eligible-agent lookup.
    select: () =>
      query(() =>
        fixture.agentEligible
          ? [{ id: agentUserId, firstName: "Ana", lastName: "Cruz", brokerId: fixture.newBroker }]
          : [],
      ),
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        // The locked deal.
        select: () =>
          query(() => [
            {
              title: "Maria Santos",
              status: fixture.status,
              amount: "5000000.00",
              primaryAgentUserId: "old-agent",
              brokerUserId: "broker",
            },
          ]),
        update: () => ({
          set: (value: Record<string, unknown>) => {
            fixture.updates.push(value);
            return { where: async () => {} };
          },
        }),
        delete: () => ({
          where: async () => {
            fixture.deletes += 1;
          },
        }),
        insert: () => ({
          values: (value: unknown) => {
            fixture.inserts.push(value);
            return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => {} });
          },
        }),
      }),
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async (permission: string) => {
    if (!fixture.permissions.has(permission)) throw new Error("Forbidden");
    return {
      organizationId: "organization",
      userId: "actor",
      roles: ["manager"],
      permissions: fixture.permissions,
    };
  },
  canAccessResource: async () => true,
}));
vi.mock("@/lib/permissions/scope", () => ({ scopedAgentCondition: () => undefined }));
vi.mock("@/features/contacts/lib/assignment", () => ({ eligibleAgent: () => undefined }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  fixture.permissions = new Set(["deals.reassign_agent"]);
  fixture.agentEligible = true;
  fixture.status = "open";
  fixture.updates = [];
  fixture.inserts = [];
  fixture.deletes = 0;
  fixture.newBroker = "new-broker";
});

const input = { dealId, agentUserId, reason: "Agent left the team" };

it("moves an open opportunity to the new agent and their broker, recomputing no commission", async () => {
  expect((await reassignDealAgent(input)).success).toBe(true);
  expect(fixture.updates[0]).toEqual(
    expect.objectContaining({ primaryAgentUserId: agentUserId, brokerUserId: "new-broker" }),
  );
  // Shares kept from an earlier win (none on a deal never won) only change hands.
  expect(fixture.updates.slice(1)).toEqual([{ userId: "new-broker" }, { userId: agentUserId }]);
  expect(fixture.inserts).toContainEqual({ dealId, userId: agentUserId, role: "primary" });
});

it("makes an agent with no broker the opportunity's broker", async () => {
  fixture.newBroker = null;
  await reassignDealAgent(input);
  expect(fixture.updates[0]).toMatchObject({ brokerUserId: agentUserId });
});

it("moves a won opportunity's commission shares as they were won, not at today's rates", async () => {
  fixture.status = "won";
  expect((await reassignDealAgent(input)).success).toBe(true);
  // The broker's share goes to the new broker, the seller's to the new agent; nothing recomputed.
  expect(fixture.updates).toContainEqual({ userId: "new-broker" });
  expect(fixture.updates).toContainEqual({ userId: agentUserId });
  expect(fixture.deletes).toBe(1); // only the old primary agent link
});

it("drops the broker share when the new agent is their own broker", async () => {
  fixture.status = "won";
  fixture.newBroker = null;
  await reassignDealAgent(input);
  expect(fixture.deletes).toBe(2);
  expect(fixture.updates).toContainEqual({ userId: agentUserId });
});

it("refuses an agent who isn't eligible or in scope", async () => {
  fixture.agentEligible = false;
  expect((await reassignDealAgent(input)).success).toBe(false);
  expect(fixture.updates).toEqual([]);
});

it("refuses a caller without deals.reassign_agent", async () => {
  fixture.permissions = new Set(["deals.update"]);
  await expect(reassignDealAgent(input)).rejects.toThrow("Forbidden");
  expect(fixture.updates).toEqual([]);
});

it("requires a reason", async () => {
  expect((await reassignDealAgent({ ...input, reason: " " })).success).toBe(false);
});
