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
  expect(html).toMatch(/aria-label="available: Available"(?![^>]*disabled)/);
  for (const code of ["sold", "deposit_paid", "inactive"])
    expect(html).toMatch(new RegExp(`aria-label="${code}:[^"]*"[^>]*disabled`));
});
it("allows an existing sold selection to be removed and retains a consistent selected state", () => {
  const html = renderToStaticMarkup(
    createElement(ParkingPicker, { slots, selectedIds: ["sold"], onToggle: () => {} }),
  );
  expect(html).toMatch(/aria-pressed="true" aria-label="sold: Sold out"(?![^>]*disabled)/);
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
  expect(html).toMatch(/aria-label="sold: Sold out"[^>]*disabled/);
});
