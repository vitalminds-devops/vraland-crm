import { expect, it } from "vitest";
import { opportunityPrice, opportunitySelectionSchema } from "./opportunity-pricing";

it("adds selected units and optional parking in cents", () => {
  expect(opportunityPrice("120000.25", 2, "25000.50", 2)).toEqual({
    units: "240000.50",
    parking: "50001.00",
    total: "290001.50",
  });
  expect(opportunityPrice("0.10", 3, "0.20", 1)?.total).toBe("0.50");
  expect(opportunityPrice("120000", 1, null, 0)?.total).toBe("120000.00");
});

it("requires configured prices and rejects unsafe totals", () => {
  expect(opportunityPrice(null, 1, "100", 1)).toBeNull();
  expect(opportunityPrice("100", 1, null, 1)).toBeNull();
  expect(opportunityPrice("9999999999999999", 50, "100", 1)).toBeNull();
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
