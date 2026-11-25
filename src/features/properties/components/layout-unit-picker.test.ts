import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LayoutUnitPicker } from "./layout-unit-picker";

const placement = (id: string, unitId: string, x: number) => ({
  id,
  unitId,
  typeId: "type",
  x,
  y: 0,
  w: 8,
  h: 6,
  rotation: 0 as const,
  flip: false,
});

it("marks given, held back and locked units on the plan", () => {
  const html = renderToStaticMarkup(
    createElement(LayoutUnitPicker, {
      layout: {
        width: 24,
        depth: 6,
        units: [placement("p1", "a", 0), placement("p2", "b", 8), placement("p3", "c", 16)],
        spaces: [],
      },
      designs: {},
      units: [
        { id: "a", code: "1A", status: "available", accessible: true },
        { id: "b", code: "1B", status: "available", accessible: true },
        { id: "c", code: "1C", status: "sold", accessible: false },
      ],
      isGranted: (id) => id === "a",
      isHeldBack: (id) => id === "b",
      onToggle: () => {},
    }),
  );
  expect(html).toContain('aria-label="Unit 1A, Given"');
  expect(html).toContain('aria-label="Unit 1B, Held back"');
  expect(html).toContain('aria-label="Unit 1C, Not yours to share"');
  expect(html).toMatch(/aria-disabled="true"[^>]*aria-label="Unit 1C/);
});
