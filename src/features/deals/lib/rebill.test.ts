import { expect, it } from "vitest";

import { rebuildBill } from "./rebill";

const base = {
  unitCodes: ["1A", "1B"],
  place: "Tower 2 · Fairfield",
  buildingTitle: "Tower 2",
  unitPrice: "2500000",
  parkingSlots: 1,
  parkingPrice: "500000",
  // A 5% miscellaneous fee on a 2,000,000 bill.
  previous: { unitPrice: "2000000", miscellaneousFee: "100000", reservationDiscount: "0" },
  paid: 0,
};

it("prices each unit and the parking, keeping the old fee rate", () => {
  const bill = rebuildBill(base);
  expect(bill).toEqual({
    unitLabel:
      "Unit 1A · Tower 2 · Fairfield + Unit 1B · Tower 2 · Fairfield + Parking (1 slot) · Tower 2",
    unitPrice: "5500000.00",
    miscellaneousFee: "275000.00",
    lines: [
      {
        unitLabel: "Unit 1A · Tower 2 · Fairfield",
        unitPrice: "2500000.00",
        miscellaneousFee: "125000.00",
      },
      {
        unitLabel: "Unit 1B · Tower 2 · Fairfield",
        unitPrice: "2500000.00",
        miscellaneousFee: "125000.00",
      },
      {
        unitLabel: "Parking (1 slot) · Tower 2",
        unitPrice: "500000.00",
        miscellaneousFee: "25000.00",
      },
    ],
  });
});

it("keeps the bill total equal to the sum of its lines", () => {
  const bill = rebuildBill({
    ...base,
    unitCodes: ["1A"],
    parkingSlots: 0,
    unitPrice: "1234567.89",
    previous: { unitPrice: "3", miscellaneousFee: "1", reservationDiscount: "0" },
  });
  if ("error" in bill) throw new Error(bill.error);
  const fees = bill.lines.reduce((sum, line) => sum + Number(line.miscellaneousFee), 0);
  expect(Number(bill.miscellaneousFee)).toBeCloseTo(fees, 2);
});

it("has no fee when the old bill had no price", () => {
  const bill = rebuildBill({
    ...base,
    previous: { unitPrice: "0", miscellaneousFee: "0", reservationDiscount: "0" },
  });
  expect("error" in bill ? bill : bill.miscellaneousFee).toBe("0.00");
});

it("refuses a discount larger than the new price", () => {
  expect(
    rebuildBill({
      ...base,
      unitCodes: ["1A"],
      parkingSlots: 0,
      previous: { ...base.previous, reservationDiscount: "3000000" },
    }),
  ).toEqual({ error: "discount" });
});

it("refuses a total below what is already paid", () => {
  expect(rebuildBill({ ...base, unitCodes: [], parkingSlots: 0, paid: 1000 })).toEqual({
    error: "below-paid",
  });
});
