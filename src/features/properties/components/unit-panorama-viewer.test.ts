import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { UnitPanoramaViewer } from "./unit-panorama-viewer";

vi.mock("@/components/ui/dialog", () => {
  const content = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  return {
    Dialog: content,
    DialogPortal: content,
    DialogOverlay: () => null,
    DialogPopup: content,
    DialogTitle: content,
    DialogDescription: content,
  };
});

it("fits photos without distortion and provides named controls", () => {
  const html = renderToStaticMarkup(
    createElement(UnitPanoramaViewer, { imageUrl: "/photo", unitCode: "1A", onClose: () => {} }),
  );
  expect(html).toContain('alt="Unit 1A"');
  expect(html).toContain("object-contain");
  expect(html).not.toContain("background-size");
  for (const label of ["Close photo viewer", "Zoom in", "Zoom out", "Fit photo", "Zoom level"])
    expect(html).toContain(`aria-label="${label}"`);
});

it("shows an empty state and disables zoom when a photo is unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(UnitPanoramaViewer, { imageUrl: null, unitCode: "1A", onClose: () => {} }),
  );
  expect(html).toContain("No photo available for this unit.");
  expect(html).not.toContain("<img");
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});
