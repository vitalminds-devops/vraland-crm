import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FilePrintActions } from "./file-print-actions";

it("opens the original PDF with its native print and save controls", () => {
  const html = renderToStaticMarkup(
    createElement(FilePrintActions, { id: "file", mimeType: "application/pdf" }),
  );
  expect(html).toContain('href="/api/documents/file/download?inline=1"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain("Print / Save as PDF");
});

it.each(["image/jpeg", "image/png"])("prints %s using the browser print dialog", (mimeType) => {
  const print = vi.fn();
  vi.stubGlobal("window", { print });
  try {
    const button = FilePrintActions({ id: "file", mimeType });
    button!.props.onClick();
    expect(print).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not offer printing for unsupported types", () => {
  expect(FilePrintActions({ id: "file", mimeType: "text/html" })).toBeNull();
});
