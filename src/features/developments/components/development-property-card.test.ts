import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DevelopmentPropertyCard } from "./development-property-card";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children),
}));

function property(): ComponentProps<typeof DevelopmentPropertyCard>["property"] {
  return {
    id: "property",
    code: "QA-1",
    title: "QA House 1",
    propertyType: "condominium",
    status: "available",
    addressLine1: null,
    city: null,
    floorCount: 20,
    unitsPerFloor: null,
    unitIdentifierStyle: "letter",
    floors: Array.from({ length: 20 }, (_, index) => ({
      id: `floor-${index + 1}`,
      propertyId: "property",
      level: index + 1,
      label: `Floor ${index + 1}`,
      units:
        index === 0
          ? [
              {
                id: "a",
                propertyId: "property",
                floorId: "floor-1",
                code: "1A",
                status: "available",
              },
              { id: "b", propertyId: "property", floorId: "floor-1", code: "1B", status: "sold" },
            ]
          : [],
    })),
  };
}

it("shows actual totals, shared unit statuses, and descending floors without duplicate property lists", () => {
  const html = renderToStaticMarkup(
    createElement(DevelopmentPropertyCard, {
      property: property(),
      canEdit: false,
      canAccess: false,
    }),
  );
  expect(html).toContain("20 Floors");
  expect(html).toContain("2 Units");
  expect(html).toContain("1 Available");
  expect(html).toContain('aria-label="Unit 1B, Sold out"');
  expect(html.indexOf('aria-label="Toggle Floor 20"')).toBeLessThan(
    html.indexOf('aria-label="Toggle Floor 1"'),
  );
  expect(html).toContain("Show 14 more empty floors");
  expect(html).not.toContain('aria-label="Toggle Floor 10"');
});

it("never folds a middle floor containing inventory", () => {
  const data = property();
  data.floors[9].units = [
    { id: "mid", propertyId: "property", floorId: "floor-10", code: "10A", status: "available" },
  ];
  const html = renderToStaticMarkup(
    createElement(DevelopmentPropertyCard, { property: data, canEdit: false, canAccess: false }),
  );
  expect(html).toContain('aria-label="Unit 10A, Available"');
  expect(html).not.toContain("more empty floors");
});

it("handles properties without floors", () => {
  const data = property();
  data.floors = [];
  const html = renderToStaticMarkup(
    createElement(DevelopmentPropertyCard, { property: data, canEdit: false, canAccess: false }),
  );
  expect(html).toContain("No floors configured yet.");
  expect(html).toContain("0 Available");
});
