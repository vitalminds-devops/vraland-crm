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
vi.mock("../actions/parking-layout.actions", () => ({ saveParkingLayout: vi.fn() }));
vi.mock("../actions/bulk-remove.actions", () => ({
  deleteUnits: vi.fn(),
  deleteParkingSlots: vi.fn(),
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

it("opens on the top-view plan with every slot in one lot", () => {
  const slots = Array.from({ length: 13 }, (_, index) => ({
    id: String(index),
    code: `P${index + 1}`,
    status: "available",
  }));
  const html = renderToStaticMarkup(createElement(ParkingSlots, { propertyId: "property", slots }));
  expect(html).toContain('data-scene-slots="13"');
  expect(html).not.toContain("Area 1 of 2");
  expect(html).not.toContain(">List<");
  expect(html).toContain("13 slots");
  expect(html).not.toContain("Add slot");
});

it("badges each slot with its own price, and none when it has none", () => {
  const bay = (price: string | null) =>
    renderToStaticMarkup(
      createElement(ParkingBay, {
        slot: { id: "slot", code: "P3", status: "available", price },
        canManage: false,
      }),
    );
  expect(bay("350000")).toContain("Available · ₱350K");
  expect(bay(null)).not.toContain("·");
});
