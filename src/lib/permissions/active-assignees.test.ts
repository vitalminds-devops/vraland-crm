import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { InactiveAssigneeError, lockActiveAssignees } from "./active-assignees";

type Tx = Parameters<typeof lockActiveAssignees>[0];

/** A transaction whose one select finds `rows` among the active users. */
function txFinding(rows: { id: string }[]) {
  const lock = vi.fn(async () => rows);
  const where = vi.fn();
  const chain = {
    from: () => chain,
    where: (condition: unknown) => (where(condition), chain),
    orderBy: () => chain,
    for: lock,
  };
  const select = vi.fn(() => chain);
  return { tx: { select } as unknown as Tx, select, lock, where };
}

it("locks the users for share and passes when all are still active", async () => {
  const { tx, lock, where } = txFinding([{ id: "a" }, { id: "b" }]);
  await expect(lockActiveAssignees(tx, "org", ["b", "a", "b", null])).resolves.toBeUndefined();
  expect(lock).toHaveBeenCalledWith("share");
  // Unique and sorted, so concurrent callers lock in one order.
  expect(new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL).params.slice(0, 2)).toEqual([
    "a",
    "b",
  ]);
});

it("refuses when a user is inactive, deleted or in another organization", async () => {
  // The query filters those out, so fewer rows come back than ids asked for.
  const { tx, where } = txFinding([{ id: "a" }]);
  await expect(lockActiveAssignees(tx, "org", ["a", "b"])).rejects.toBeInstanceOf(
    InactiveAssigneeError,
  );
  const { sql, params } = new PgDialect().sqlToQuery(where.mock.calls[0][0] as SQL);
  expect(sql).toMatch(/"organization_id" = \$\d+.*"status" = \$\d+.*"deleted_at" is null/);
  expect(params).toEqual(expect.arrayContaining(["org", "active"]));
});

it("does nothing when nobody is being assigned", async () => {
  const { tx, select } = txFinding([]);
  await lockActiveAssignees(tx, "org", [null, undefined, ""]);
  expect(select).not.toHaveBeenCalled();
});
