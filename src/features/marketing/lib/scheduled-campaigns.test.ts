import { expect, it, vi } from "vitest";

const writes = vi.hoisted(() => [] as string[]);

vi.mock("@/db", () => {
  // The due list, then the campaign as deliverCampaign reads it.
  const results = [
    [{ id: "campaign", organizationId: "org" }],
    [{ id: "campaign", status: "scheduled", channel: "sms", smsTemplateId: null }],
  ];
  let index = 0;
  return {
    db: {
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
      select: () => {
        const rows = results[index++] ?? [];
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: () => query,
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
        };
        return query;
      },
      insert: () => ({ values: async () => void writes.push("audit") }),
    },
  };
});
vi.mock("@/lib/messaging/providers", () => ({
  getEmailProvider: () => null,
  getSmsProvider: () => null,
}));

const { sendDueCampaigns } = await import("./campaign-delivery");

it("leaves a due campaign that can't send scheduled for the next run, without logging it as sent", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await sendDueCampaigns(new Date("2026-11-13T00:00:00Z"))).toBe(0);
  expect(writes).toEqual([]);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("not sent"));
});
