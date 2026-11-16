import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ParkingBay, ParkingSlots } from "./parking-slots";

vi.mock("../actions/parking.actions", () => ({
  addParkingSlot: vi.fn(),
  assignParkingSlotFloor: vi.fn(),
  deleteParkingSlot: vi.fn(),
  renameParkingSlot: vi.fn(),
  setParkingSlotStatus: vi.fn(),
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ slots }: { slots: { code: string }[] }) =>
      createElement(
        "div",
        { "data-scene-slots": slots.length },
        slots.map((s) => s.code).join(","),
      ),
}));

it("keeps presentation read-only and labels each real parking bay", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingBay, {
      slot: { id: "slot", code: "P3", status: "deposit_paid" },
      canManage: false,
    }),
  );
  expect(html).toContain('aria-label="Parking P3: Reserved"');
  expect(html).not.toContain("<select");
  expect(html).not.toContain("Rename parking");
});

it.each(["deposit_paid", "sold"])("prevents removing an occupied slot (%s)", (status) => {
  const html = renderToStaticMarkup(
    createElement(ParkingBay, { slot: { id: "slot", code: "P3", status }, canManage: true }),
  );
  expect(html).toContain('aria-label="Parking P3 status"');
  expect(html).toMatch(/aria-label="Remove parking P3"[^>]*disabled/);
});

it("defaults to the list with every parking slot", () => {
  const slots = Array.from({ length: 13 }, (_, index) => ({
    id: String(index),
    code: `P${index + 1}`,
    status: "available",
  }));
  const html = renderToStaticMarkup(createElement(ParkingSlots, { propertyId: "property", slots }));
  expect(html).not.toContain("data-scene-slots");
  for (const slot of slots) {
    expect(html).toContain(`aria-label="Parking ${slot.code}: Available"`);
  }
  expect(html).toContain("13 slots");
  expect(html).not.toContain("Add slot");
});
