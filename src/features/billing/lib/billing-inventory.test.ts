import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { syncDealInventory } from "@/features/deals/lib/deal-inventory";
import {
  inventoryStatusForDeal,
  lockDealForInventory,
  readDealPayments,
  syncBillingInventory,
} from "./billing-inventory";

vi.mock("@/features/deals/lib/deal-inventory", () => ({
  syncDealInventory: vi.fn(async () => ["building"]),
}));

const stage = {
  isWonStage: false,
  isLostStage: false,
  isCancelledStage: false,
  position: 2,
  opportunityPosition: 2,
};
const deal = {
  slug: "opportunity",
  ...stage,
  id: "deal",
  propertyId: "building",
  brokerUserId: null,
  unitId: "primary",
  unitIds: ["primary", "second"],
  parkingSlotIds: ["parking"],
};
type Transaction = Parameters<typeof syncBillingInventory>[0];

function transaction(rows: unknown[]) {
  const forUpdate = vi.fn();
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    for: (...args: unknown[]) => {
      forUpdate(...args);
      return query;
    },
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  const select = vi.fn<(fields: Record<string, SQL>) => typeof query>(() => query);
  return { tx: { select } as unknown as Transaction, forUpdate, select };
}

beforeEach(() => vi.clearAllMocks());

it.each([
  { stage, total: 1000, paid: 1000, expected: "sold" },
  { stage, total: 1000, paid: 100, expected: "deposit_paid" },
  { stage, total: 1000, paid: 0, expected: "deposit_paid" },
  { stage: { ...stage, position: 1 }, total: 1000, paid: 0, expected: "available" },
  { stage: { ...stage, position: 1 }, total: 1000, paid: 100, expected: "deposit_paid" },
  { stage: { ...stage, isWonStage: true }, total: 1000, paid: 0, expected: "sold" },
  { stage: { ...stage, isLostStage: true }, total: 1000, paid: 1000, expected: "available" },
  { stage: { ...stage, isCancelledStage: true }, total: 1000, paid: 1000, expected: "available" },
  { stage: { ...stage, position: 1 }, total: 0, paid: 0, expected: "available" },
])(
  "maps billing and stage state to $expected (paid $paid / $total)",
  ({ stage, total, paid, expected }) => {
    expect(inventoryStatusForDeal(stage, { total, paid })).toBe(expected);
  },
);

it("reads only active payments and defaults a missing bill to no payments", async () => {
  expect(await readDealPayments(transaction([]).tx, "deal")).toEqual({ total: 0, paid: 0 });
  expect(
    await readDealPayments(transaction([{ total: "123.45", paid: "23.45" }]).tx, "deal"),
  ).toEqual({ total: 123.45, paid: 23.45 });
});

it("qualifies the outer bill ID in the payment sum so payment IDs cannot shadow it", async () => {
  const { tx, select } = transaction([]);
  await readDealPayments(tx, "deal");
  const expression = select.mock.calls[0][0]!.paid;
  const statement = new PgDialect().sqlToQuery(expression).sql;
  expect(statement).toContain('p.bill_id = "bills"."id"');
  expect(statement).toContain("p.deleted_at is null");
});

it("locks the persisted deal snapshot before billing or inventory writes", async () => {
  const { tx, forUpdate } = transaction([deal]);
  expect(await lockDealForInventory(tx, "org", "deal")).toEqual(deal);
  expect(forUpdate).toHaveBeenCalledWith(
    "update",
    expect.objectContaining({ of: expect.anything() }),
  );
});

it("marks all persisted units and parking sold after a settled payment", async () => {
  const { tx } = transaction([{ total: "1000", paid: "1000" }]);
  expect(await syncBillingInventory(tx, { organizationId: "org", userId: "actor" }, deal)).toEqual([
    "building",
  ]);
  expect(syncDealInventory).toHaveBeenCalledWith(tx, {
    organizationId: "org",
    actorUserId: "actor",
    dealId: "deal",
    buildingId: "building",
    unitIds: ["primary", "second"],
    parkingSlotIds: ["parking"],
    status: "sold",
  });
});

it("uses the legacy primary unit when there is no saved unit array", async () => {
  const { tx } = transaction([{ total: "1000", paid: "100" }]);
  await syncBillingInventory(
    tx,
    { organizationId: "org", userId: "actor" },
    { ...deal, unitIds: [] },
  );
  expect(syncDealInventory).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({ unitIds: ["primary"], status: "deposit_paid" }),
  );
});

it("releases Leads inventory after its last payment is removed", async () => {
  const { tx } = transaction([{ total: "1000", paid: "0" }]);
  await syncBillingInventory(
    tx,
    { organizationId: "org", userId: "actor" },
    { ...deal, position: 1 },
  );
  expect(syncDealInventory).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({ status: "available" }),
  );
});
