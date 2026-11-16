import { describe, expect, it } from "vitest";

import { commissionSplit } from "./commission-split";

const roleRates = new Map<string, number | null>([
  ["agent", 3],
  ["broker", 5],
]);
const links = [{ roleId: "agent", parentRoleId: "broker", sellerRate: 2, parentRate: 1 }];

describe("commissionSplit", () => {
  it("splits an agent's sale with their broker through the link", () => {
    expect(
      commissionSplit({
        base: 2_300_000,
        sellerRoleIds: ["agent"],
        brokerRoleIds: ["broker"],
        roleRates,
        links,
      }),
    ).toEqual([
      { recipient: "seller", roleId: "agent", rate: 2, amount: 46_000 },
      { recipient: "broker", roleId: "broker", rate: 1, amount: 23_000 },
    ]);
  });

  it("pays the role's own rate when there is no broker", () => {
    expect(
      commissionSplit({
        base: 2_300_000,
        sellerRoleIds: ["agent"],
        brokerRoleIds: [],
        roleRates,
        links,
      }),
    ).toEqual([{ recipient: "seller", roleId: "agent", rate: 3, amount: 69_000 }]);
  });

  it("pays the own rate when the broker's role is not linked", () => {
    expect(
      commissionSplit({
        base: 1_000,
        sellerRoleIds: ["agent"],
        brokerRoleIds: ["other"],
        roleRates,
        links,
      }),
    ).toEqual([{ recipient: "seller", roleId: "agent", rate: 3, amount: 30 }]);
  });

  it("pays nothing when no rate is set", () => {
    expect(
      commissionSplit({
        base: 1_000,
        sellerRoleIds: ["viewer"],
        brokerRoleIds: [],
        roleRates,
        links,
      }),
    ).toEqual([]);
  });

  it("rounds to centavos", () => {
    expect(
      commissionSplit({
        base: 1_234.56,
        sellerRoleIds: ["agent"],
        brokerRoleIds: [],
        roleRates: new Map([["agent", 2.5]]),
        links: [],
      })[0].amount,
    ).toBe(30.86);
  });
});
