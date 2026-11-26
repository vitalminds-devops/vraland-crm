import { expect, it } from "vitest";
import { dealStatusLabel, dealTypeLabel } from "./deal-label";

it("names statuses and types the way the app shows them, keeping unknown values", () => {
  expect(["open", "won", "lost", "cancelled"].map(dealStatusLabel)).toEqual([
    "Open",
    "Won",
    "Lost",
    "Cancelled",
  ]);
  expect(["sale", "rent", "lease"].map(dealTypeLabel)).toEqual(["Sale", "Rent", "Lease"]);
  expect(dealStatusLabel("archived")).toBe("archived");
});
