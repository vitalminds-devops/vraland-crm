import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mock = vi.hoisted(() => ({
  permissions: new Set(["billing.view"]),
  where: vi.fn(),
  record: null as null | { name: string; storageKey: string; mimeType: string },
}));
vi.mock("@/lib/permissions/authorization", async (load) => {
  const actual = await load<typeof import("@/lib/permissions/authorization")>();
  return {
    ...actual,
    requireAuthorizationContext: async () => ({
      userId: "viewer",
      organizationId: "org",
      roles: [],
      permissions: mock.permissions,
    }),
  };
});
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: (value: unknown) => {
          mock.where(value);
          return chain;
        },
        limit: async () => (mock.record ? [mock.record] : []),
      };
      return chain;
    },
  },
}));

import { getPaymentSlip } from "./billing.queries";

beforeEach(() => {
  vi.clearAllMocks();
  mock.permissions = new Set(["billing.view"]);
  mock.record = null;
});

it("requires billing access before looking up a slip", async () => {
  mock.permissions.clear();
  await expect(getPaymentSlip("payment")).rejects.toThrow();
  expect(mock.where).not.toHaveBeenCalled();
});

it("restricts slips to the payment's organization and opportunity data scope", async () => {
  expect(await getPaymentSlip("payment")).toBeNull();
  const query = new PgDialect().sqlToQuery(mock.where.mock.calls[0][0]);
  expect(query.params).toEqual(["payment", "org", "org", "org", "viewer"]);
  expect(query.sql).toContain('"payments"."deleted_at" is null');
  expect(query.sql).toContain('"deals"."primary_agent_user_id"');
  expect(query.sql).toContain('"documents"."deal_id" = "deals"."id"');
});

it("returns the stored file details to an authorized bill viewer", async () => {
  mock.record = {
    name: "transfer.pdf",
    storageKey: "org/payments/slip.pdf",
    mimeType: "application/pdf",
  };
  expect(await getPaymentSlip("payment")).toEqual(mock.record);
});
