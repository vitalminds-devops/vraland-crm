import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentPreview } from "./document-preview";

it.each(["image/jpeg", "image/png"])(
  "previews %s through the authenticated inline route",
  (mimeType) => {
    const html = renderToStaticMarkup(
      createElement(DocumentPreview, { id: "document", name: "Government ID", mimeType }),
    );
    expect(html).toContain("<img");
    expect(html).toContain('alt="Preview of Government ID"');
    expect(html).toContain('src="/api/documents/document/download?inline=1"');
    expect(html).toContain("Open in new tab");
    expect(html).not.toContain("<iframe");
  },
);

it("embeds PDFs with a named frame and an option to open the original", () => {
  const html = renderToStaticMarkup(
    createElement(DocumentPreview, {
      id: "document",
      name: "Contract.pdf",
      mimeType: "application/pdf",
    }),
  );
  expect(html).toContain("<iframe");
  expect(html).toContain('title="Preview of Contract.pdf"');
  expect(html).toContain('src="/api/documents/document/download?inline=1"');
  expect(html).toContain('target="_blank"');
});

it.each([
  null,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/html",
  "image/svg+xml",
])("offers download instead of embedding %s", (mimeType) => {
  const html = renderToStaticMarkup(
    createElement(DocumentPreview, { id: "document", name: "Document", mimeType }),
  );
  expect(html).toContain("Preview is unavailable for this file type.");
  expect(html).toContain('href="/api/documents/document/download"');
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<iframe");
});
