import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { campaigns } from "@/db/schema";

const mock = vi.hoisted(() => ({
  selects: [] as unknown[][],
  // Rows each update on the campaigns table returns, in order: stall recovery, unschedule
  // unsendable, claim, completion.
  campaignUpdates: [] as unknown[][],
  limits: [] as number[],
  audits: [] as Record<string, unknown>[],
  send: vi.fn(async () => {}),
  sms: true,
  logError: vi.fn(),
}));

vi.mock("@/db", () => {
  const thenable = (rows: unknown[]) => ({
    returning: async () => rows,
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  });
  return {
    db: {
      select: () => {
        const rows = mock.selects.shift() ?? [];
        const query = {
          from: () => query,
          innerJoin: () => query,
          where: () => query,
          orderBy: () => query,
          limit: (n: number) => (mock.limits.push(n), query),
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
        };
        return query;
      },
      update: (table: unknown) => ({
        set: () => ({
          where: () =>
            // Recipient updates always succeed in claiming their row.
            thenable(
              table === campaigns ? (mock.campaignUpdates.shift() ?? []) : [{ contactId: "p1" }],
            ),
        }),
      }),
      insert: () => ({
        values: async (rows: Record<string, unknown> | Record<string, unknown>[]) =>
          void mock.audits.push(...[rows].flat()),
      }),
    },
  };
});
vi.mock("@/lib/messaging/providers", () => ({
  getEmailProvider: () => null,
  getSmsProvider: () => (mock.sms ? { send: mock.send } : null),
}));
vi.mock("@/lib/logger", () => ({ logError: mock.logError }));

const { sendDueCampaigns, startScheduledCampaigns } = await import("./campaign-delivery");

const now = new Date("2026-11-13T00:00:00Z");
const due = [{ id: "campaign", organizationId: "org" }];
const campaign = { id: "campaign", status: "scheduled", channel: "sms", smsTemplateId: "t" };
const template = [{ body: "Hi {{first_name}}" }];
const recipients = [{ contactId: "p1", firstName: "Ana", email: null, phone: "+639170000000" }];

beforeEach(() => {
  mock.selects = [];
  mock.campaignUpdates = [];
  mock.limits = [];
  mock.audits = [];
  mock.sms = true;
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

it("claims a due campaign and sends each recipient once", async () => {
  mock.selects = [due, [campaign], template, recipients];
  mock.campaignUpdates = [[], [], [{ id: "campaign" }], [{ id: "campaign" }]];
  expect(await sendDueCampaigns(now)).toBe(1);
  expect(mock.send).toHaveBeenCalledExactlyOnceWith({ to: "+639170000000", body: "Hi Ana" });
  expect(mock.audits).toHaveLength(1);
  expect(mock.limits[0]).toBe(4);
});

it("sends nothing when another server claimed the campaign first", async () => {
  mock.selects = [due, [campaign], template, recipients];
  // The claim finds the campaign no longer scheduled.
  mock.campaignUpdates = [[], [], []];
  expect(await sendDueCampaigns(now)).toBe(0);
  expect(mock.send).not.toHaveBeenCalled();
  expect(mock.audits).toEqual([]);
  expect(mock.logError).toHaveBeenCalledWith("Scheduled campaign not sent", expect.any(String), {
    campaignId: "campaign",
  });
});

it("moves an unsendable old campaign back to draft so a newer one still sends", async () => {
  const old = { id: "old-social", organizationId: "org", channel: "social" };
  mock.selects = [due, [campaign], template, recipients];
  mock.campaignUpdates = [[], [old], [{ id: "campaign" }], [{ id: "campaign" }]];
  expect(await sendDueCampaigns(now)).toBe(1);
  expect(mock.send).toHaveBeenCalledOnce();
  expect(mock.audits[0]).toMatchObject({
    entityId: "old-social",
    oldValues: { status: "scheduled" },
    newValues: { status: "draft", reason: "Not sent: No social publishing provider." },
  });
  expect(mock.audits[1]).toMatchObject({
    entityId: "campaign",
    newValues: { trigger: "schedule" },
  });
});

it("runs at start-up and every minute, once per process, logging failures", async () => {
  vi.useFakeTimers();
  // Every run finds nothing due.
  startScheduledCampaigns();
  startScheduledCampaigns();
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.limits).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mock.limits).toHaveLength(2);
  expect(mock.logError).not.toHaveBeenCalled();
});
