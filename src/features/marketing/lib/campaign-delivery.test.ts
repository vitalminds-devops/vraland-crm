import { beforeEach, expect, it, vi } from "vitest";
import { campaignRecipients, campaigns } from "@/db/schema";
import { recoverStalledCampaigns } from "./campaign-delivery";

const mock = vi.hoisted(() => ({
  stalled: [] as { id: string }[],
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
}));
vi.mock("@/db", () => ({
  db: {
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        mock.updates.push({ table, values });
        const where = () => ({ returning: async () => mock.stalled });
        return { where };
      },
    }),
  },
}));
vi.mock("@/lib/messaging/providers", () => ({
  getEmailProvider: vi.fn(),
  getSmsProvider: vi.fn(),
}));

beforeEach(() => {
  mock.stalled = [];
  mock.updates = [];
});

it("pauses a stalled campaign and fails, not resends, its mid-send recipients", async () => {
  mock.stalled = [{ id: "campaign" }];
  expect(await recoverStalledCampaigns(new Date("2026-11-12T00:00:00Z"))).toBe(1);
  expect(mock.updates.map((u) => [u.table, u.values.status ?? u.values.deliveryStatus])).toEqual([
    [campaigns, "paused"],
    [campaignRecipients, "failed"],
  ]);
});

it("leaves recipients alone when nothing stalled", async () => {
  expect(await recoverStalledCampaigns()).toBe(0);
  expect(mock.updates.map((u) => u.table)).toEqual([campaigns]);
});
