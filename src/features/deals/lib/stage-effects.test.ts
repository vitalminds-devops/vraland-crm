import { expect, it, vi } from "vitest";
import { recordOutcomeChange } from "./stage-effects";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

function fakeTx() {
  const rows: Record<string, unknown>[] = [];
  const tx = { insert: () => ({ values: async (row: Record<string, unknown>) => rows.push(row) }) };
  return { tx: tx as never, rows };
}
const actor = { organizationId: "org", userId: "me" };
const state = (status: string) => ({ stageId: status, stageName: status, status });

it.each([
  ["won", "open", "reopen"],
  ["lost", "open", "reopen"],
  ["won", "cancelled", "outcome_changed"],
  ["cancelled", "lost", "outcome_changed"],
])("audits leaving %s for %s as %s", async (from, to, action) => {
  const { tx, rows } = fakeTx();
  await recordOutcomeChange(tx, actor, {
    dealId: "d",
    note: " why ",
    from: state(from),
    to: state(to),
  });
  expect(rows).toEqual([
    expect.objectContaining({ action, newValues: { ...state(to), note: "why" } }),
  ]);
});

it("writes nothing for moves between open stages or into an outcome", async () => {
  const { tx, rows } = fakeTx();
  await recordOutcomeChange(tx, actor, {
    dealId: "d",
    note: "",
    from: state("open"),
    to: state("won"),
  });
  await recordOutcomeChange(tx, actor, {
    dealId: "d",
    note: "",
    from: state("won"),
    to: state("won"),
  });
  expect(rows).toEqual([]);
});
