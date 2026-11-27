import { expect, it } from "vitest";
import { auditLogs, dealAgents, deals } from "@/db/schema";
import { moveOpenDeals } from "./move-open-deals";

/** A transaction that returns `open` for the select and records every write. */
function fakeTx(open: { id: string; agentUserId: string | null; brokerUserId: string | null }[]) {
  const writes: { kind: string; table: unknown; values?: unknown }[] = [];
  const chain = { from: () => chain, innerJoin: () => chain, where: async () => open };
  const tx = {
    select: () => chain,
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => void writes.push({ kind: "update", table, values }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => void writes.push({ kind: "delete", table }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        writes.push({ kind: "insert", table, values });
        return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => {} });
      },
    }),
  };
  return { tx: tx as unknown as Parameters<typeof moveOpenDeals>[0], writes };
}

const base = { organizationId: "org", actorUserId: "admin", contactId: "contact" };

it("hands open opportunities to the new agent and broker, with a log entry each", async () => {
  const { tx, writes } = fakeTx([
    { id: "d1", agentUserId: "old-agent", brokerUserId: "old-broker" },
    { id: "d2", agentUserId: "old-agent", brokerUserId: "old-broker" },
  ]);
  const moved = await moveOpenDeals(tx, {
    ...base,
    agentUserId: "new-agent",
    brokerUserId: "new-broker",
  });
  expect(moved).toBe(2);
  expect(writes.find((w) => w.table === deals)?.values).toMatchObject({
    agentUserId: "new-agent",
    brokerUserId: "new-broker",
    updatedBy: "admin",
  });
  expect(writes.some((w) => w.kind === "delete" && w.table === dealAgents)).toBe(true);
  expect(writes.find((w) => w.kind === "insert" && w.table === dealAgents)?.values).toEqual([
    { dealId: "d1", userId: "new-agent", role: "primary" },
    { dealId: "d2", userId: "new-agent", role: "primary" },
  ]);
  expect(writes.find((w) => w.table === auditLogs)?.values).toHaveLength(2);
});

it("changes only the broker when no agent is given", async () => {
  const { tx, writes } = fakeTx([{ id: "d1", agentUserId: "agent", brokerUserId: "old-broker" }]);
  await moveOpenDeals(tx, { ...base, brokerUserId: "new-broker" });
  const update = writes.find((w) => w.table === deals)?.values as Record<string, unknown>;
  expect(update.brokerUserId).toBe("new-broker");
  expect("agentUserId" in update).toBe(false);
  expect(writes.some((w) => w.table === dealAgents)).toBe(false);
});

it("writes nothing when the contact has no open opportunities", async () => {
  const { tx, writes } = fakeTx([]);
  expect(await moveOpenDeals(tx, { ...base, agentUserId: "a", brokerUserId: "b" })).toBe(0);
  expect(writes).toEqual([]);
});
