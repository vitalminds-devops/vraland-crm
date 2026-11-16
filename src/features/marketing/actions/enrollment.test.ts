import { beforeEach, expect, it, vi } from "vitest";
import { automationEnrollments } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  reads: [] as unknown[][],
  txReads: [] as unknown[][],
  inserts: [] as unknown[],
  locks: 0,
}));
vi.mock("@/db", () => {
  function query(rows: unknown) {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "limit"]) chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  }
  const insert = (table: unknown) => ({
    values: () => {
      mocks.inserts.push(table);
      return {
        returning: async () => [{ id: "enrollment" }],
        then: (r: (v: unknown) => unknown) => r(undefined),
      };
    },
  });
  return {
    db: {
      select: () => query(mocks.reads.shift() ?? []),
      insert,
      transaction: async (work: (tx: unknown) => unknown) =>
        work({
          execute: async () => {
            mocks.locks++;
          },
          select: () => query(mocks.txReads.shift() ?? []),
          insert,
        }),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor" })),
}));
vi.mock("@/lib/permissions/scope", () => ({ dataScopeCondition: () => undefined }));
vi.mock("@/lib/messaging/providers", () => ({
  getEmailProvider: vi.fn(),
  getSmsProvider: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { enrollInSequence } from "./marketing.actions";

const input = {
  sequenceId: "00000000-0000-4000-8000-000000000001",
  contactId: "00000000-0000-4000-8000-000000000002",
  dealId: "",
};

beforeEach(() => {
  mocks.inserts = [];
  mocks.locks = 0;
  // The active sequence, then the contact in scope.
  mocks.reads = [[{ id: input.sequenceId }], [{ id: input.contactId }]];
});

it("enrolls a contact once, under a lock", async () => {
  mocks.txReads = [[]];
  expect((await enrollInSequence(input)).success).toBe(true);
  expect(mocks.locks).toBe(1);
  expect(mocks.inserts).toContain(automationEnrollments);
});

it("refuses a second active enrollment in the same sequence", async () => {
  mocks.txReads = [[{ id: "existing" }]];
  expect(await enrollInSequence(input)).toMatchObject({
    success: false,
    error: { message: "This person is already in this follow-up." },
  });
  expect(mocks.inserts).not.toContain(automationEnrollments);
});
