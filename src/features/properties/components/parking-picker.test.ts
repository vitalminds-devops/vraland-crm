import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ParkingPicker } from "./parking-picker";

const slots = ["available", "sold", "deposit_paid", "inactive"].map((status) => ({
  id: status,
  code: status,
  status,
  accessible: true,
}));
it("only allows available parking to be newly selected", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingPicker, { slots, selectedIds: [], onToggle: () => {} }),
  );
  expect(html).toMatch(/aria-label="Parking available, Available"(?![^>]*disabled)/);
  for (const code of ["sold", "deposit_paid", "inactive"])
    expect(html).toMatch(new RegExp(`aria-label="Parking ${code},[^"]*"[^>]*disabled`));
});
it("allows an existing sold selection to be removed and retains a consistent selected state", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingPicker, { slots, selectedIds: ["sold"], onToggle: () => {} }),
  );
  expect(html).toMatch(/aria-pressed="true" aria-label="Parking sold, Sold out"(?![^>]*disabled)/);
  expect(html).toContain("border-primary bg-primary/5");
  expect(html).not.toContain("bg-slate-700");
});

it("uses unit-style chips in compact mode and keeps unavailable parking disabled", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingPicker, {
      slots,
      selectedIds: ["available"],
      onToggle: () => {},
      compact: true,
    }),
  );
  expect(html).toContain("min-h-10");
  expect(html).toContain("border-primary bg-primary text-primary-foreground");
  expect(html).not.toContain("min-h-32");
  expect(html).not.toContain("lucide-car");
  expect(html).toMatch(/aria-label="Parking sold, Sold out"[^>]*disabled/);
});

it("shows each slot's price, and its type and fee on hover", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingPicker, {
      slots: [
        {
          id: "p1",
          code: "P1",
          status: "available",
          accessible: true,
          price: "500000",
          reservationFee: "10000",
          parkingTypeName: "Tandem",
        },
      ],
      selectedIds: [],
      onToggle: () => {},
    }),
  );
  expect(html).toContain("₱500K");
  expect(html).toContain("Tandem");
  expect(html).toContain("Reservation fee ₱10,000");
});
