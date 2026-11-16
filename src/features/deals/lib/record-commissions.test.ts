import { beforeEach, expect, it } from "vitest";
import { recordDealCommissions } from "./record-commissions";

type Tx = Parameters<typeof recordDealCommissions>[0];

// Selects in call order: the bill, then (together) role holders, roles and commission links.
function fakeTx(billNet: string | null) {
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const results = [
    billNet === null ? [] : [{ net: billNet }],
    [
      { userId: "seller", roleId: "agent" },
      { userId: "broker", roleId: "broker" },
    ],
    [
      { id: "agent", name: "Agent", rate: "3" },
      { id: "broker", name: "Broker", rate: "5" },
    ],
    [{ roleId: "agent", parentRoleId: "broker", sellerRate: "2", parentRate: "1" }],
  ];
  let index = 0;
  const tx = {
    delete: () => ({ where: async () => {} }),
    select: () => {
      const rows = results[index++];
      const query = {
        from: () => query,
        where: () => query,
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    insert: () => ({
      values: async (rows: Record<string, unknown>[]) => void inserted.push(...rows),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updates.push(value);
        return { where: async () => {} };
      },
    }),
  };
  return { tx: tx as unknown as Tx, inserted, updates };
}

const deal = {
  organizationId: "org",
  dealId: "deal",
  amount: "9999999",
  sellerUserId: "seller",
  brokerUserId: "broker",
};

let fake: ReturnType<typeof fakeTx>;
beforeEach(() => {
  fake = fakeTx("2300000");
});

it("pays on the billed net price, not the deal value, and totals the expected commission", async () => {
  await recordDealCommissions(fake.tx, deal);
  expect(fake.inserted).toEqual([
    expect.objectContaining({
      userId: "seller",
      rate: "2.00",
      baseAmount: "2300000.00",
      amount: "46000.00",
    }),
    expect.objectContaining({
      userId: "broker",
      rate: "1.00",
      baseAmount: "2300000.00",
      amount: "23000.00",
    }),
  ]);
  expect(fake.updates).toEqual([{ expectedCommission: "69000.00" }]);
});

it("falls back to the deal value when there is no bill", async () => {
  fake = fakeTx(null);
  await recordDealCommissions(fake.tx, { ...deal, amount: "1000000" });
  expect(fake.inserted[0]).toMatchObject({ baseAmount: "1000000.00", amount: "20000.00" });
});

it("pays a broker who sold their own deal once, at their seller rate", async () => {
  await recordDealCommissions(fake.tx, { ...deal, brokerUserId: "seller" });
  expect(fake.inserted).toEqual([expect.objectContaining({ userId: "seller", rate: "3.00" })]);
});

it("records nothing without a seller or a positive base", async () => {
  await recordDealCommissions(fake.tx, { ...deal, sellerUserId: null });
  fake = fakeTx("0");
  await recordDealCommissions(fake.tx, { ...deal, amount: null });
  expect(fake.inserted).toEqual([]);
  expect(fake.updates).toEqual([]);
});
