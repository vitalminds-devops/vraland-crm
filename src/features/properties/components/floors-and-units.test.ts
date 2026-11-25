import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FloorsAndUnits } from "./floors-and-units";

vi.mock("./unit-controls", () => ({
  AddFloorButton: () => null,
  RemoveFloorButton: () => null,
  RenameUnitButton: () => null,
  UnitStatusControl: () => null,
}));
vi.mock("./unit-picture-dialog", () => ({ UnitPictureDialog: () => null }));
vi.mock("../actions/unit.actions", () => ({ addFloor: vi.fn(), renameFloor: vi.fn() }));
vi.mock("../actions/bulk-remove.actions", () => ({
  deleteUnits: vi.fn(),
  deleteParkingSlots: vi.fn(),
}));
vi.mock("./floor-designer", () => ({ FloorDesigner: () => null }));
vi.mock("./parking-slot-dialog", () => ({ ParkingSlotDialog: () => null }));
vi.mock("./unit-details-dialog", () => ({ UnitDetailsButton: () => null }));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ units, children }: { units: { id: string }[]; children?: React.ReactNode }) =>
      createElement(
        "div",
        { "data-floor-model": units.map((unit) => unit.id).join(",") },
        children,
      ),
}));

it("shows only the plan prompt for a floor that isn't designed yet", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
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
  expect(html).toContain("No floor plan yet.");
  expect(html).toContain(">1 unit</p>");
  expect(html).toContain('aria-label="Unit status on this floor"');
  expect(html).toContain('aria-label="Minimize floor list"');
  // No unit cards: units only appear on the designed plan.
  expect(html).not.toContain("Preview 1A photo");
  expect(html).not.toContain("data-floor-model");
  expect(html).not.toContain("Design floor");
});

it("draws a designed floor's visible units and keeps hidden units private", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      floors: [
        {
          id: "floor",
          level: 1,
          label: "1st Floor",
          imageStorageKey: null,
          unitCount: 7,
          layout: {
            width: 40,
            depth: 16,
            units: [],
            spaces: [{ id: "s", kind: "hallway", x: 0, y: 7, w: 40, h: 2, rotation: 0 }],
          },
        },
      ],
      units: Array.from({ length: 5 }, (_, index) => ({
        id: `visible-${index}`,
        code: `1${index}`,
        status: "available",
        floorId: "floor",
        imageStorageKey: null,
      })),
    }),
  );
  expect(html).toContain('data-floor-model="visible-0,visible-1,visible-2,visible-3,visible-4"');
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
  expect(html).toContain("No floors yet.");
  expect(html).not.toContain("configured");
  expect(html).not.toContain("held back");
  expect(html).not.toContain("shared with you");
  expect(html).not.toContain("80");
});

it("keeps the empty immersive floor light, with a floor picker and a design action for managers", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      immersive: true,
      canManageUnits: true,
      overlayInfo: "Mabini, Cabadbaran City",
      floors: [
        { id: "roof", level: 12, label: "RoofTop", imageStorageKey: null, unitCount: 0 },
        { id: "floor", level: 1, label: "1st Floor", imageStorageKey: null, unitCount: 0 },
      ],
      units: [],
    }),
  );
  expect(html).toContain("This floor isn&#x27;t designed yet.");
  expect(html).toContain("Design this floor to display its layout.");
  expect(html).toContain('aria-label="Floor"');
  expect(html).toContain('href="/design/property?tab=floors"');
  expect(html).toContain("Mabini, Cabadbaran City");
  expect(html).not.toContain("bg-black/60");
  expect(html).not.toContain("border-dashed");
  expect(html).not.toContain('aria-label="Unit status on this floor"');
});

it("does not offer design controls to read-only viewers of an empty immersive floor", () => {
  const html = renderToStaticMarkup(
    createElement(FloorsAndUnits, {
      propertyId: "property",
      immersive: true,
      floors: [
        { id: "roof", level: 12, label: "RoofTop", imageStorageKey: null, unitCount: 0 },
        { id: "floor", level: 1, label: "1st Floor", imageStorageKey: null, unitCount: 0 },
      ],
      units: [],
    }),
  );
  expect(html).toContain("Choose another floor to view its layout.");
  expect(html).toContain('aria-label="Floor"');
  expect(html).not.toContain("Design property");
  expect(html).not.toContain("/design/property");
});
