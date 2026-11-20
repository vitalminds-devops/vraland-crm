import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FloorsAndUnits } from "./floors-and-units";

vi.mock("./unit-controls", () => ({
  AddFloorButton: () => null,
  AddUnitButton: () => null,
  RemoveFloorButton: () => null,
  RemoveUnitButton: () => null,
  RenameUnitButton: () => null,
  UnitStatusControl: () => null,
}));
vi.mock("./unit-picture-dialog", () => ({ UnitPictureDialog: () => null }));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ units }: { units: { id: string }[] }) =>
      createElement("div", { "data-floor-model": units.map((unit) => unit.id).join(",") }),
}));

it("lets clients preview unit photos without exposing editing controls", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      propertyTitle: "QA House 1",
      floors: [{ id: "floor", level: 1, label: "1st Floor", imageStorageKey: null, unitCount: 1 }],
      units: [
        {
          id: "unit",
          code: "1A",
          status: "available",
          floorId: "floor",
          imageStorageKey: "photo.jpg",
        },
      ],
    }),
  );
  expect(html).toContain('aria-label="Preview 1A photo"');
  expect(html).toContain("1A");
  expect(html).not.toContain("data-floor-model");
  expect(html).toMatch(/aria-pressed="true"[^>]*>List<\/button>/);
  expect(html).not.toContain("Unit Photos");
  expect(html).toContain("Available");
  expect(html).not.toContain("Edit 1A picture");
  expect(html).not.toContain("Add unit");
});

it("lists every visible unit and keeps hidden units private", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      floors: [{ id: "floor", level: 1, label: "1st Floor", imageStorageKey: null, unitCount: 7 }],
      units: Array.from({ length: 5 }, (_, index) => ({
        id: `visible-${index}`,
        code: `1${index}`,
        status: "available",
        floorId: "floor",
        imageStorageKey: null,
      })),
    }),
  );
  expect(html).not.toContain("data-floor-model");
  for (let index = 0; index < 5; index++) {
    expect(html).toContain(`Unit 1${index}`);
  }
  // Units not shared with the viewer are not counted or mentioned anywhere.
  expect(html).not.toContain("not shared");
  expect(html).not.toContain("of 7");
  expect(html).not.toContain(">7<");
});

it("does not reveal configured inventory when no floors are granted", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      floors: [],
      units: [],
    }),
  );
  expect(html).toContain("No floors to display.");
  expect(html).not.toContain("configured");
  expect(html).not.toContain("held back");
  expect(html).not.toContain("shared with you");
  expect(html).not.toContain("80");
});
