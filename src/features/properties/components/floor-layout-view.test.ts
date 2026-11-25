import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { FloorLayout, UnitDesign } from "../lib/floor-layout";
import { FloorLayoutView } from "./floor-layout-view";

const design: UnitDesign = {
  width: 8,
  depth: 6,
  rooms: [{ id: "r1", kind: "bedroom", x: 0, y: 0, w: 3, h: 3.5, rotation: 0 }],
};
const layout: FloorLayout = {
  width: 30,
  depth: 12,
  units: [
    { id: "p1", typeId: "t1", unitId: "u1", x: 0, y: 0, w: 8, h: 6, rotation: 0, flip: false },
    { id: "p2", typeId: "t1", unitId: "hidden", x: 8, y: 0, w: 8, h: 6, rotation: 90, flip: true },
  ],
  spaces: [{ id: "s1", kind: "hallway", x: 0, y: 8, w: 30, h: 2, rotation: 0 }],
};

it("draws visible units with their number, size and type, and hides the rest", () => {
  const html = renderToStaticMarkup(
    createElement(FloorLayoutView, {
      layout,
      label: "3rd Floor",
      units: [
        {
          id: "u1",
          code: "301",
          status: "available",
          typeName: "2 BR",
          bedrooms: 2,
          floorArea: 48,
        },
      ],
      designs: new Map([["t1", design]]),
      selectedUnitId: null,
      onSelect: () => {},
    }),
  );
  expect(html).toContain("Unit 301, 48 sqm, 2 BR");
  expect(html).toContain("48 sqm · 2 BR");
  expect(html).toContain("Hallway");
  expect(html.match(/role="button"/g)).toHaveLength(1);
});
