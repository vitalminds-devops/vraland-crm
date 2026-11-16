import { describe, expect, it } from "vitest";

import { planDuplicateDeals, type DuplicateDealCandidate } from "./duplicate-deals";

const deal = (over: Partial<DuplicateDealCandidate>): DuplicateDealCandidate => ({
  id: over.dealCode ?? "x",
  dealCode: "x",
  createdAt: new Date("2026-11-04T01:00:00Z"),
  stageChanges: 1,
  agents: 0,
  attachments: 0,
  ...over,
});

describe("planDuplicateDeals", () => {
  it("keeps the worked-on deal and removes the empty auto-opened one", () => {
    const worked = deal({ dealCode: "B37D9E49", stageChanges: 5, agents: 1 });
    const empty = deal({ dealCode: "88164ECD" });
    const plan = planDuplicateDeals([empty, worked]);
    expect(plan.keep.dealCode).toBe("B37D9E49");
    expect(plan.remove.map((d) => d.dealCode)).toEqual(["88164ECD"]);
  });

  it("keeps the oldest when they are equally worked on", () => {
    const older = deal({
      dealCode: "OLD",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    });
    const newer = deal({ dealCode: "NEW" });
    expect(planDuplicateDeals([newer, older]).keep.dealCode).toBe("OLD");
  });

  it("never removes a duplicate that has a bill, offer or task", () => {
    const plan = planDuplicateDeals([
      deal({ dealCode: "KEEP", stageChanges: 3 }),
      deal({ dealCode: "BILLED", attachments: 1 }),
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.blocked.map((d) => d.dealCode)).toEqual(["BILLED"]);
  });

  it("never treats an opportunity added for another development as a duplicate", () => {
    const sotera = deal({ dealCode: "SOTERA", stageChanges: 4 });
    const fairfield = deal({ dealCode: "FAIRFIELD", intentional: true });
    const plan = planDuplicateDeals([sotera, fairfield]);
    expect(plan.keep.dealCode).toBe("SOTERA");
    expect(plan.remove).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });
});
