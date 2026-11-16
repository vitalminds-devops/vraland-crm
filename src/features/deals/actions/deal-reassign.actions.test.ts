import { beforeEach, expect, it, vi } from "vitest";
import { reassignDealAgent } from "./deal-reassign.actions";
import { recordDealCommissions } from "../lib/record-commissions";

const dealId = "12345678-1234-4234-8234-123456789abc";
const agentUserId = "22345678-1234-4234-8234-123456789abc";
const fixture = vi.hoisted(() => ({
  permissions: new Set<string>(["deals.reassign_agent"]),
  agentEligible: true,
  status: "open",
  updates: [] as Record<string, unknown>[],
  inserts: [] as unknown[],
}));

function query(rows: () => unknown[]) {
  const q = {
    from: () => q,
    where: () => q,
    limit: () => q,
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
        fixture.agentEligible ? [{ id: agentUserId, firstName: "Ana", lastName: "Cruz" }] : [],
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
        delete: () => ({ where: async () => {} }),
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
vi.mock("../lib/record-commissions", () => ({ recordDealCommissions: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  fixture.permissions = new Set(["deals.reassign_agent"]);
  fixture.agentEligible = true;
  fixture.status = "open";
  fixture.updates = [];
  fixture.inserts = [];
  vi.mocked(recordDealCommissions).mockClear();
});

const input = { dealId, agentUserId, reason: "Agent left the team" };

it("moves an open opportunity to the new agent without touching commission", async () => {
  expect((await reassignDealAgent(input)).success).toBe(true);
  expect(fixture.updates[0]).toMatchObject({ primaryAgentUserId: agentUserId });
  expect(fixture.inserts).toContainEqual({ dealId, userId: agentUserId, role: "primary" });
  expect(recordDealCommissions).not.toHaveBeenCalled();
});

it("recomputes a won opportunity's commission for the new agent", async () => {
  fixture.status = "won";
  expect((await reassignDealAgent(input)).success).toBe(true);
  expect(recordDealCommissions).toHaveBeenCalledWith(expect.anything(), {
    organizationId: "organization",
    dealId,
    amount: "5000000.00",
    sellerUserId: agentUserId,
    brokerUserId: "broker",
  });
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
