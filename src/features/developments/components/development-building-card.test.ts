import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DevelopmentBuildingCard } from "./development-building-card";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children),
}));

function building(): ComponentProps<typeof DevelopmentBuildingCard>["building"] {
  return {
    id: "building",
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
      buildingId: "building",
      level: index + 1,
      label: `Floor ${index + 1}`,
      units:
        index === 0
          ? [
              {
                id: "a",
                buildingId: "building",
                floorId: "floor-1",
                code: "1A",
                status: "available",
              },
              { id: "b", buildingId: "building", floorId: "floor-1", code: "1B", status: "sold" },
            ]
          : [],
    })),
  };
}

it("shows actual totals, shared unit statuses, and descending floors without duplicate property lists", () => {
  const html = renderToStaticMarkup(
    createElement(DevelopmentBuildingCard, {
      building: building(),
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
  const data = building();
  data.floors[9].units = [
    { id: "mid", buildingId: "building", floorId: "floor-10", code: "10A", status: "available" },
  ];
  const html = renderToStaticMarkup(
    createElement(DevelopmentBuildingCard, { building: data, canEdit: false, canAccess: false }),
  );
  expect(html).toContain('aria-label="Unit 10A, Available"');
  expect(html).not.toContain("more empty floors");
});

it("handles buildings without floors", () => {
  const data = building();
  data.floors = [];
  const html = renderToStaticMarkup(
    createElement(DevelopmentBuildingCard, { building: data, canEdit: false, canAccess: false }),
  );
  expect(html).toContain("No floors configured yet.");
  expect(html).toContain("0 Available");
});
