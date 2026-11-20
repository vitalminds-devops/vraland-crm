import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { UserDocumentsWorkspace } from "./user-documents-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/settings.actions", () => ({
  saveUserCertificate: vi.fn(),
  saveUserDocument: vi.fn(),
}));

const user = {
  id: "user-1",
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  phone: null,
  status: "active",
  roles: [],
};

it("explains empty sections and file limits before uploading", () => {
  const html = renderToStaticMarkup(createElement(UserDocumentsWorkspace, { user, documents: [] }));
  expect(html).toContain("Add a certificate to record its number and validity dates.");
  expect(html).toContain("No other documents yet.");
  expect(html).toContain("Up to 15 MB per file.");
  expect(html).toContain("Upload document");
});

it("keeps preview, replacement and download actions attached to the named file", () => {
  const html = renderToStaticMarkup(
    createElement(UserDocumentsWorkspace, {
      user,
      documents: [
        {
          id: "file-1",
          name: "cse_id_photos_cut_guides.pdf",
          documentType: "other",
          mimeType: "application/pdf",
          fileSizeBytes: 46797,
          createdAt: new Date("2026-11-20T00:00:00Z"),
          validFrom: null,
          validUntil: null,
          certificateNumber: null,
        },
      ],
    }),
  );
  expect(html).toContain('aria-label="Preview cse_id_photos_cut_guides.pdf"');
  expect(html).toContain('aria-label="Replace cse_id_photos_cut_guides.pdf"');
  expect(html).toContain('aria-label="Download cse_id_photos_cut_guides.pdf"');
  expect(html).toContain('href="/api/settings/user-documents/file-1/download"');
  expect(html).toContain("45.7 KB");
  expect(html).not.toContain("No other documents yet.");
});
