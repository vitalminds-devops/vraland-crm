import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AccessTower } from "./access-tower";

it("draws one window per unit and lights only the visible ones", () => {
  const html = renderToStaticMarkup(
    createElement(AccessTower, {
      title: "Tower 2",
      floors: [
        { id: "f1", label: "1st Floor" },
        { id: "f2", label: "2nd Floor" },
      ],
      units: [
        { id: "a", code: "1A", floorId: "f1" },
        { id: "b", code: "1B", floorId: "f1" },
        { id: "c", code: "2A", floorId: "f2" },
      ],
      isGranted: (id) => id !== "b",
      activeFloorId: "f1",
      onPickFloor: () => {},
    }),
  );
  expect(html.match(/fill-primary stroke-primary\/60/g)?.length).toBe(2);
  expect(html).toContain("Unit 1B (hidden)");
  expect(html).toContain('aria-label="1st Floor: 1 of 2 units visible"');
  expect(html).toContain('aria-label="Tower 2: 2 of 3 units visible"');
});

it("draws a mini tower with no labels, legend or buttons", () => {
  const html = renderToStaticMarkup(
    createElement(AccessTower, {
      title: "Tower 2",
      floors: [{ id: "f1", label: "1st Floor" }],
      units: [{ id: "a", code: "1A", floorId: "f1" }],
      isGranted: () => true,
      activeFloorId: "f1",
      mini: true,
    }),
  );
  expect(html).not.toContain("<text");
  expect(html).not.toContain("figcaption");
  expect(html).not.toContain('role="button"');
  expect(html).toContain("stroke-primary"); // active floor still outlined
});
