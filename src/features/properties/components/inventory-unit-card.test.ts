import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InventoryUnitCard } from "./inventory-unit-card";

it("keeps selection, status and preview as distinct accessible actions", () => {
  const html = renderToStaticMarkup(
    createElement(InventoryUnitCard, {
      code: "1A",
      status: "available",
      imageUrl: "/photo",
      selected: true,
      onToggle: () => {},
      onPreview: () => {},
    }),
  );
  expect(html).toContain('role="checkbox" aria-checked="true" aria-label="Select unit 1A"');
  expect(html).toContain('aria-label="Preview 1A photo"');
  expect(html).toContain("border-primary");
  expect(html).toContain("Available");
});
it("supports read-only property cards without selection or editing controls", () => {
  const html = renderToStaticMarkup(
    createElement(InventoryUnitCard, { code: "1A", status: "sold", imageUrl: null }),
  );
  expect(html).not.toContain("<button");
  expect(html).toContain("Sold out");
  expect(html).toContain("Unit 1A");
});

it.each(["sold", "deposit_paid", "inactive"])(
  "blocks new selection of %s units but permits removal",
  (status) => {
    const render = (selected: boolean) =>
      renderToStaticMarkup(
        createElement(InventoryUnitCard, {
          code: "2H",
          status,
          imageUrl: null,
          selected,
          onToggle: () => {},
        }),
      );
    expect(render(false)).toContain('disabled=""');
    expect(render(true)).not.toContain('disabled=""');
  },
);
