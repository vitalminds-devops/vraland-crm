import { expect, it } from "vitest";

import { rebuildBill, selectionChanged } from "./rebill";

const base = {
  units: [
    { id: "u1", code: "1A", price: "2500000" },
    { id: "u2", code: "1B", price: "2500000" },
  ],
  place: "Tower 2 · Fairfield",
  buildingTitle: "Tower 2",
  slots: [{ id: "s1", code: "P1", price: "500000" }],
  // A 5% miscellaneous fee on a 2,000,000 bill.
  previous: { itemsTotal: "2000000", miscellaneousFee: "100000", reservationDiscount: "0" },
  paid: 0,
};

it("prices each unit at the old fee rate and each parking slot on its own line", () => {
  const bill = rebuildBill(base);
  expect(bill).toEqual({
    itemsLabel:
      "Unit 1A · Tower 2 · Fairfield + Unit 1B · Tower 2 · Fairfield + Parking P1 · Tower 2",
    itemsTotal: "5500000.00",
    miscellaneousFee: "250000.00",
    lines: [
      {
        unitId: "u1",
        parkingSlotId: null,
        unitLabel: "Unit 1A · Tower 2 · Fairfield",
        unitPrice: "2500000.00",
        miscellaneousFee: "125000.00",
      },
      {
        unitId: "u2",
        parkingSlotId: null,
        unitLabel: "Unit 1B · Tower 2 · Fairfield",
        unitPrice: "2500000.00",
        miscellaneousFee: "125000.00",
      },
      {
        unitId: null,
        parkingSlotId: "s1",
        unitLabel: "Parking P1 · Tower 2",
        unitPrice: "500000.00",
        miscellaneousFee: "0.00",
      },
    ],
  });
});

it("keeps the bill total equal to the sum of its lines", () => {
  const bill = rebuildBill({
    ...base,
    units: [{ id: "u1", code: "1A", price: "1234567.89" }],
    slots: [],
    previous: { itemsTotal: "3", miscellaneousFee: "1", reservationDiscount: "0" },
  });
  if ("error" in bill) throw new Error(bill.error);
  const fees = bill.lines.reduce((sum, line) => sum + Number(line.miscellaneousFee), 0);
  expect(Number(bill.miscellaneousFee)).toBeCloseTo(fees, 2);
});

it("has no fee when the old bill had no price", () => {
  const bill = rebuildBill({
    ...base,
    previous: { itemsTotal: "0", miscellaneousFee: "0", reservationDiscount: "0" },
  });
  expect("error" in bill ? bill : bill.miscellaneousFee).toBe("0.00");
});

it("refuses a discount larger than the new price", () => {
  expect(
    rebuildBill({
      ...base,
      units: [{ id: "u1", code: "1A", price: "2500000" }],
      slots: [],
      previous: { ...base.previous, reservationDiscount: "3000000" },
    }),
  ).toEqual({ error: "discount" });
});

it("refuses a total below what is already paid", () => {
  expect(rebuildBill({ ...base, units: [], slots: [], paid: 1000 })).toEqual({
    error: "below-paid",
  });
});

it("keeps the billed price and fee of units and slots already on the bill", () => {
  const bill = rebuildBill({
    ...base,
    units: [
      { id: "u1", code: "1A", price: "3300000" },
      { id: "u2", code: "1B", price: "2500000" },
    ],
    keep: [
      {
        unitLabel: "Unit 1A · Tower 2 · Fairfield",
        unitPrice: "3000000.00",
        miscellaneousFee: "1.00",
      },
    ],
  });
  expect(bill.lines?.[0]).toMatchObject({ unitPrice: "3000000.00", miscellaneousFee: "1.00" });
  expect(bill.lines?.[1]).toMatchObject({ unitPrice: "2500000.00" });
});

it("finds a billed unit or slot by itself, even after a rename or a relabel in Billing", () => {
  const bill = rebuildBill({
    ...base,
    units: [{ id: "u1", code: "1A-R", price: "3300000" }],
    slots: [{ id: "s1", code: "P9", price: "900000" }],
    keep: [
      { unitId: "u1", unitLabel: "1A corner", unitPrice: "3000000.00", miscellaneousFee: "5.00" },
      { parkingSlotId: "s1", unitLabel: "Slot", unitPrice: "400000.00", miscellaneousFee: "0.00" },
      // An older line for another unit with the same label is not taken.
      {
        unitId: "u7",
        unitLabel: "Unit 1A-R · Tower 2 · Fairfield",
        unitPrice: "1.00",
        miscellaneousFee: "0",
      },
    ],
  });
  expect(bill.lines).toMatchObject([
    { unitId: "u1", unitLabel: "Unit 1A-R · Tower 2 · Fairfield", unitPrice: "3000000.00" },
    { parkingSlotId: "s1", unitPrice: "400000.00" },
  ]);
});

it("tells a new pick from the same one, in any order", () => {
  const before = { propertyId: "p", unitIds: ["a", "b"], parkingSlotIds: ["s"] };
  expect(
    selectionChanged(before, { buildingId: "p", unitIds: ["b", "a"], parkingSlotIds: ["s"] }),
  ).toBe(false);
  expect(selectionChanged(before, { buildingId: "p", unitIds: ["a"], parkingSlotIds: ["s"] })).toBe(
    true,
  );
  expect(
    selectionChanged(before, { buildingId: "q", unitIds: ["a", "b"], parkingSlotIds: ["s"] }),
  ).toBe(true);
});
