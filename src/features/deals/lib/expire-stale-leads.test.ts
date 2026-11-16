import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  stale: [] as Record<string, unknown>[],
  lostStages: [] as Record<string, unknown>[],
  contactArchived: true,
  writes: [] as { table: string; value: Record<string, unknown> }[],
}));

vi.mock("@/db/client", async () => {
  const { getTableName } = await import("drizzle-orm");
  const name = (table: unknown) => getTableName(table as Parameters<typeof getTableName>[0]);
  let selects = 0;
  const tx = {
    select: () => {
      const rows = selects++ % 2 === 0 ? fixture.stale : fixture.lostStages;
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        limit: () => query,
        for: async () => rows,
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    update: (table: unknown) => ({
      set: (value: Record<string, unknown>) => {
        fixture.writes.push({ table: name(table), value });
        const where = Object.assign(Promise.resolve(), {
          returning: async () => (fixture.contactArchived ? [{ id: "contact" }] : []),
        });
        return { where: () => where };
      },
    }),
    insert: (table: unknown) => ({
      values: async (value: Record<string, unknown>) =>
        void fixture.writes.push({ table: name(table), value }),
    }),
  };
  return { db: { transaction: async (work: (t: typeof tx) => unknown) => work(tx) } };
});

const { expireStaleLeads } = await import("./expire-stale-leads");

beforeEach(() => {
  fixture.stale = [
    { dealId: "deal", organizationId: "org", stageId: "leads", contactId: "contact" },
  ];
  fixture.lostStages = [{ id: "lost", organizationId: "org" }];
  fixture.contactArchived = true;
  fixture.writes = [];
});

const tables = () => fixture.writes.map((w) => w.table);

it("closes the lead as lost in the organization's Lost stage and archives its contact", async () => {
  expect(await expireStaleLeads()).toBe(1);
  expect(fixture.writes[0]).toMatchObject({
    table: "deals",
    value: { stageId: "lost", status: "lost" },
  });
  expect(tables()).toEqual([
    "deals",
    "deal_stage_history",
    "contacts",
    "documents",
    "automation_enrollments",
    "audit_logs",
  ]);
});

it("keeps the documents and follow-ups of a contact still on another deal", async () => {
  fixture.contactArchived = false;
  await expireStaleLeads();
  expect(tables()).not.toContain("documents");
  expect(tables()).not.toContain("automation_enrollments");
});

it("never leaves an expired lead marked lost in the Leads stage", async () => {
  fixture.lostStages = [];
  await expireStaleLeads();
  expect(fixture.writes).toEqual([]);
});

it("does nothing when no lead is due", async () => {
  fixture.stale = [];
  expect(await expireStaleLeads()).toBe(0);
  expect(fixture.writes).toEqual([]);
});
