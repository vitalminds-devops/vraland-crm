import { expect, it, vi } from "vitest";
import { getBilledUnitPrices } from "./billed-prices.queries";

vi.mock("server-only", () => ({}));
const rows = vi.hoisted(() => [
  { unitId: "u1", price: "3000000.00" },
  { unitId: "u1", price: "3100000.00" },
  { unitId: "u2", price: "2500000.00" },
]);
vi.mock("@/db", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => rows,
  };
  return { db: { selectDistinct: () => chain } };
});

const context = (permissions: string[]) =>
  ({ organizationId: "org", userId: "user", permissions: new Set(permissions) }) as never;

it("groups billed prices by unit for users who can see Billing", async () => {
  expect(await getBilledUnitPrices(context(["billing.view"]), "p1")).toEqual({
    u1: ["3000000.00", "3100000.00"],
    u2: ["2500000.00"],
  });
});

it("shows nothing to users without Billing", async () => {
  expect(await getBilledUnitPrices(context([]), "p1")).toEqual({});
});
