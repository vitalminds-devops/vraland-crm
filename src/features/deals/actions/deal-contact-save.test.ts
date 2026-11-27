import { beforeEach, expect, it, vi } from "vitest";
import { saveDealForContact } from "./deal.actions";

const stageId = "12345678-1234-4234-8234-123456789abc";
const fixture = vi.hoisted(() => ({
  status: "open",
  earned: false,
  updates: [] as Record<string, unknown>[],
}));

// Selects in call order: the contact's deal, the contact, then the locked deal inside the transaction.
function selects() {
  const rows = () => [
    [{ id: "deal", stageId: "12345678-1234-4234-8234-123456789abc", primaryAgentUserId: null }],
    [{ firstName: "Maria", lastName: "Santos", preferredDevelopmentId: null }],
    [
      {
        title: "Maria Santos",
        dealType: "sale",
        developmentId: null,
        amount: "5000000.00",
        expectedCommission: "150000.00",
        expectedCloseDate: null,
        status: fixture.status,
        earned: fixture.earned,
      },
    ],
  ];
  let index = 0;
  return () => {
    const result = rows()[index++] ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      for: async () => result,
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  };
}

vi.mock("@/db", () => {
  let select: ReturnType<typeof selects>;
  const update = () => ({
    set: (value: Record<string, unknown>) => {
      fixture.updates.push(value);
      return { where: async () => {} };
    },
  });
  return {
    db: {
      get select() {
        return select;
      },
      reset: () => (select = selects()),
      transaction: async (work: (tx: unknown) => Promise<unknown>) =>
        work({ select, update, insert: () => ({ values: async () => {} }) }),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "organization",
    userId: "actor",
    roles: ["administrator"],
    permissions: new Set<string>(["deals.update"]),
  }),
  canAccessResource: async () => true,
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => {
  fixture.updates = [];
  fixture.earned = false;
  const { db } = (await import("@/db")) as unknown as { db: { reset: () => void } };
  db.reset();
});

const input = {
  dealType: "sale" as const,
  stageId,
  amount: "6000000",
  expectedCommission: "1",
  expectedCloseDate: "",
};

it("saves the amount and commission from the contact form on an open deal", async () => {
  fixture.status = "open";
  expect((await saveDealForContact("contact", null, input)).success).toBe(true);
  expect(fixture.updates[0]).toMatchObject({ amount: "6000000.00", expectedCommission: "1.00" });
});

it("keeps a won deal's settled amount and commission", async () => {
  fixture.status = "won";
  expect((await saveDealForContact("contact", null, input)).success).toBe(true);
  expect(fixture.updates[0]).toMatchObject({
    amount: "5000000.00",
    expectedCommission: "150000.00",
  });
});

it("keeps the commission from the first win while a won deal is reopened", async () => {
  fixture.status = "open";
  fixture.earned = true;
  expect((await saveDealForContact("contact", null, input)).success).toBe(true);
  expect(fixture.updates[0]).toMatchObject({ amount: "6000000.00", expectedCommission: "150000.00" });
});
