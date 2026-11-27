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
        hasBroker: true,
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
        hasBroker: false,
        roleRates,
        links,
      }),
    ).toEqual([{ recipient: "seller", roleId: "agent", rate: 3, amount: 69_000 }]);
  });

  it("pays nothing to a seller under a broker when their roles are not linked", () => {
    // Under a broker the commission rule decides; the seller's own rate is only for independents.
    expect(
      commissionSplit({
        base: 1_000,
        sellerRoleIds: ["agent"],
        brokerRoleIds: ["other"],
        hasBroker: true,
        roleRates,
        links,
      }),
    ).toEqual([]);
    expect(
      commissionSplit({
        base: 1_000,
        sellerRoleIds: ["agent"],
        brokerRoleIds: [],
        hasBroker: true,
        roleRates,
        links,
      }),
    ).toEqual([]);
  });

  it("pays nothing when no rate is set", () => {
    expect(
      commissionSplit({
        base: 1_000,
        sellerRoleIds: ["viewer"],
        brokerRoleIds: [],
        hasBroker: false,
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
        hasBroker: false,
        roleRates: new Map([["agent", 2.5]]),
        links: [],
      })[0].amount,
    ).toBe(30.86);
  });

  it("pays a seller with no broker their first role that has a rate above 0%", () => {
    const rates = new Map<string, number | null>([
      ["viewer", 0],
      ["unset", null],
      ["agent", 3],
    ]);
    expect(
      commissionSplit({
        base: 1_000_000,
        sellerRoleIds: ["viewer", "unset", "agent"],
        brokerRoleIds: [],
        hasBroker: false,
        roleRates: rates,
        links,
      }),
    ).toEqual([{ recipient: "seller", roleId: "agent", rate: 3, amount: 30_000 }]);
  });
});
