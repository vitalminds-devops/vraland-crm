import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import type { PermissionKey } from "@/lib/permissions/catalog";

const mock = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  visible: true,
  inserted: vi.fn(),
  where: vi.fn(),
  openDeal: vi.fn(),
}));

vi.mock("@/db", async () => {
  const { contacts } = await import("@/db/schema");
  const select = () => {
    let table: unknown;
    const chain = {
      from: (value: unknown) => {
        table = value;
        return chain;
      },
      where: (value: unknown) => {
        mock.where(value);
        return chain;
      },
      limit: async () =>
        table === contacts
          ? mock.record && mock.visible
            ? [mock.record]
            : []
          : [{ id: "11111111-1111-4111-8111-111111111111", brokerId: null }],
    };
    return chain;
  };
  const tx = {
    select,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        mock.inserted(table, values);
        if (table === contacts) {
          if (mock.record)
            throw Object.assign(new Error("duplicate primary key"), { code: "23505" });
          mock.record = values;
        }
        return {
          returning: async () => [values],
          onConflictDoNothing: async () => [],
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        };
      },
    }),
  };
  let transaction = Promise.resolve();
  return {
    db: {
      select,
      transaction: (work: (value: typeof tx) => unknown) => {
        // Model the primary-key constraint waiting for the competing transaction to finish.
        const result = transaction.then(async () => {
          const previous = mock.record;
          try {
            return await work(tx);
          } catch (error) {
            mock.record = previous;
            throw error;
          }
        });
        transaction = result.then(
          () => {},
          () => {},
        );
        return result;
      },
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({
    organizationId: "org",
    userId: "creator",
    permissions: new Set<PermissionKey>(["records.view_all"]),
  }),
  canAccessResource: async () => true,
}));
vi.mock("@/lib/permissions/active-assignees", () => ({
  lockActiveAssignees: async () => {},
  InactiveAssigneeError: class extends Error {},
}));
vi.mock("@/lib/record-codes", () => ({ nextRecordCode: async () => "CON-000001" }));
vi.mock("../lib/contact-duplicate-lookup", () => ({ findDuplicateMatch: async () => null }));
vi.mock("@/features/marketing/lib/auto-enroll", () => ({ enrollByTrigger: async () => 0 }));
vi.mock("@/features/deals/lib/open-deal", () => ({
  openDealForApprovedContact: (...args: unknown[]) => mock.openDeal(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

import { createContact } from "./contact.actions";
import { contactSchema } from "../schemas/contact.schema";
import { contacts } from "@/db/schema";

const creationId = "22222222-2222-4222-8222-222222222222";
const input = contactSchema.parse({
  firstName: "Ana",
  lastName: "Cruz",
  assignedAgentId: "11111111-1111-4111-8111-111111111111",
  currentProvince: "Cebu",
  currentCity: "Cebu City",
  currentBarangay: "Lahug",
  budgetMin: 1000000,
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.record = null;
  mock.visible = true;
  mock.openDeal.mockResolvedValue({ success: true, data: { id: "deal", created: true } });
});

it("reuses the committed contact when the response fails and Save is retried", async () => {
  vi.mocked(revalidatePath).mockImplementationOnce(() => {
    throw new Error("response failed");
  });
  await expect(createContact(input, creationId)).rejects.toThrow("response failed");
  const writes = mock.inserted.mock.calls.length;

  expect(await createContact(input, creationId)).toEqual({
    success: true,
    data: { id: creationId },
  });
  expect(mock.inserted).toHaveBeenCalledTimes(writes);
  expect(mock.record?.id).toBe(creationId);
  expect(mock.openDeal).toHaveBeenCalledOnce();
});

it("returns the same contact for concurrent submissions", async () => {
  const results = await Promise.all([
    createContact(input, creationId),
    createContact(input, creationId),
  ]);
  expect(results).toEqual([
    { success: true, data: { id: creationId } },
    { success: true, data: { id: creationId } },
  ]);
  expect(mock.openDeal).toHaveBeenCalledOnce();
});

it("creates a contact and lead before address and property interest are collected", async () => {
  expect(
    (
      await createContact(
        {
          ...input,
          currentProvince: null,
          currentCity: null,
          currentBarangay: null,
          budgetMin: null,
          budgetMax: null,
        },
        creationId,
      )
    ).success,
  ).toBe(true);
  expect(mock.record?.id).toBe(creationId);
  expect(mock.openDeal).toHaveBeenCalledOnce();
});

it("retries an uncommitted creation after the deal transaction rolls back", async () => {
  mock.openDeal.mockResolvedValueOnce({ success: false, error: { message: "deal failed" } });
  expect((await createContact(input, creationId)).success).toBe(false);
  expect(mock.record).toBeNull();
  expect((await createContact(input, creationId)).success).toBe(true);
});

it("scopes replay lookup to the creator and organization and rejects an inaccessible id", async () => {
  mock.record = { id: creationId };
  mock.visible = false;
  expect((await createContact(input, creationId)).success).toBe(false);
  const query = new PgDialect().sqlToQuery(mock.where.mock.calls[0][0]);
  expect(query.params).toEqual([creationId, "org", "creator"]);
  expect(query.sql).toContain('"contacts"."deleted_at" is null');
});

it("validates the creation id before accessing records", async () => {
  expect((await createContact(input, "invalid")).success).toBe(false);
  expect(mock.where).not.toHaveBeenCalled();
  expect(mock.inserted.mock.calls.filter(([table]) => table === contacts)).toEqual([]);
});
