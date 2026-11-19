import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ where: vi.fn() }));

vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    organizationId: "11111111-1111-4111-8111-111111111111",
  }),
}));

vi.mock("@/db", () => {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    where: (value: unknown) => {
      mock.where(value);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return { db: { select: () => chain, selectDistinct: () => chain } };
});

import { listAuditLogs } from "./audit.queries";

it("filters the full Philippine calendar day instead of the server's day", async () => {
  await listAuditLogs({ page: 1, from: "2026-11-19", to: "2026-11-19" });

  const query = new PgDialect().sqlToQuery(mock.where.mock.calls[0][0]);
  expect(query.params).toEqual([
    "11111111-1111-4111-8111-111111111111",
    "2026-11-18T16:00:00.000Z",
    "2026-11-19T15:59:59.999Z",
  ]);
});
