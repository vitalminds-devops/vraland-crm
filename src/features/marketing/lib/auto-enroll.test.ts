import { expect, it, vi } from "vitest";
import { enrollByTrigger } from "./auto-enroll";

vi.mock("@/db", () => ({ db: {} }));

function tx(reads: unknown[][]) {
  const inserted: unknown[] = [];
  const query = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["from", "where", "limit"]) chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  };
  return {
    inserted,
    tx: {
      select: () => query(reads.shift() ?? []),
      execute: async () => {},
      insert: () => ({ values: async (values: unknown) => inserted.push(values) }),
    } as unknown as Parameters<typeof enrollByTrigger>[0],
  };
}

it("enrolls a new lead into each active sequence it triggers, skipping ones already running", async () => {
  // Two sequences; the first already has this contact enrolled.
  const { tx: t, inserted } = tx([[{ id: "s1" }, { id: "s2" }], [{ id: "existing" }], []]);
  expect(
    await enrollByTrigger(t, { organizationId: "org", trigger: "lead_created", contactId: "c" }),
  ).toBe(1);
  expect(inserted).toEqual([
    { sequenceId: "s2", contactId: "c", dealId: null, status: "active", currentStepOrder: 0 },
  ]);
});

it("brings the deal's primary contact on a stage change", async () => {
  const { tx: t, inserted } = tx([[{ id: "s1" }], [{ contactId: "primary" }], []]);
  await enrollByTrigger(t, { organizationId: "org", trigger: "deal_stage_changed", dealId: "d" });
  expect(inserted).toEqual([
    { sequenceId: "s1", contactId: "primary", dealId: "d", status: "active", currentStepOrder: 0 },
  ]);
});

it("does nothing when no sequence uses the trigger", async () => {
  const { tx: t, inserted } = tx([[]]);
  expect(
    await enrollByTrigger(t, {
      organizationId: "org",
      trigger: "viewing_completed",
      contactId: "c",
    }),
  ).toBe(0);
  expect(inserted).toEqual([]);
});
