import { expect, it } from "vitest";
import {
  isSlotFreeFor,
  missingFeeWarning,
  opportunityFees,
  opportunityPrice,
  opportunitySelectionSchema,
} from "./opportunity-pricing";

it("adds each unit's and each parking slot's own price in cents", () => {
  expect(opportunityPrice(["120000.25", "130000"], ["25000.50", "30000"])).toEqual({
    units: "250000.25",
    parking: "55000.50",
    total: "305000.75",
  });
  expect(opportunityPrice(["0.10", "0.10", "0.10"], ["0.20"])?.total).toBe("0.50");
  expect(opportunityPrice(["120000"], [])?.total).toBe("120000.00");
});

it("requires every unit and slot to be priced and rejects unsafe totals", () => {
  expect(opportunityPrice(["100", null], [])).toBeNull();
  expect(opportunityPrice([], [])).toBeNull();
  expect(opportunityPrice(["100"], [null])).toBeNull();
  expect(opportunityPrice(["100"], ["50", "0"])).toBeNull();
  expect(opportunityPrice(Array(50).fill("9999999999999999"), ["100"])).toBeNull();
});

it("requires a building and unique unit and parking IDs", () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  const selection = { developmentId: id, buildingId: id, unitIds: [id], parkingSlotIds: [id] };
  expect(opportunitySelectionSchema.safeParse(selection).success).toBe(true);
  for (const invalid of [
    { unitIds: [] },
    { unitIds: [id, id] },
    { buildingId: "" },
    { parkingSlotIds: ["invalid"] },
    { parkingSlotIds: [id, id] },
  ]) {
    expect(opportunitySelectionSchema.safeParse({ ...selection, ...invalid }).success).toBe(false);
  }
});

it("quotes the reservation fee from unit types and slots, and monthly from unit types", () => {
  expect(
    opportunityFees(
      [
        { reservationFee: "15000", monthlyAmortization: "25000.50" },
        { reservationFee: "15000.25", monthlyAmortization: null },
      ],
      ["5000", null],
    ),
  ).toEqual({
    reservationFee: "35000.25",
    parkingReservationFee: "5000.00",
    monthlyAmortization: "25000.50",
  });
  // Nothing set stays "no fee", so any payment opens the stage as before.
  expect(opportunityFees([{ reservationFee: null, monthlyAmortization: null }], [])).toEqual({
    reservationFee: null,
    parkingReservationFee: null,
    monthlyAmortization: null,
  });
});

it("lets an opportunity pick a free slot or its own held one, not another's", () => {
  expect(isSlotFreeFor({ status: "available", reservedDealId: null }, undefined)).toBe(true);
  expect(isSlotFreeFor({ status: "deposit_paid", reservedDealId: "mine" }, "mine")).toBe(true);
  expect(isSlotFreeFor({ status: "deposit_paid", reservedDealId: "theirs" }, "mine")).toBe(false);
  expect(isSlotFreeFor({ status: "sold", reservedDealId: "theirs" }, undefined)).toBe(false);
});

it("names the units with no reservation fee, or nothing when all have one", () => {
  expect(missingFeeWarning([])).toBeNull();
  expect(missingFeeWarning(["2A"])).toBe(
    "Unit 2A has no reservation fee. Set it on its unit type.",
  );
  expect(missingFeeWarning(["2B", "2A"])).toBe(
    "Units 2A, 2B have no reservation fee. Set it on their unit types.",
  );
});
