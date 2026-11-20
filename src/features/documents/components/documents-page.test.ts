import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ manage: true, archive: true, list: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/features/documents/queries/document.queries", () => ({ listDocuments: fixture.list }));
vi.mock("@/components/common/filter-form", () => ({
  FilterForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/features/documents/components/document-forms", () => ({
  DocumentUpload: () => createElement("button", null, "Upload file"),
  ArchiveButton: () => createElement("button", null, "Archive file"),
  RestoreButton: () => null,
}));
import DocumentsPage from "../../../../app/(crm)/documents/page";
import ArchivePage from "../../../../app/(crm)/documents/archive/page";
import { requirePagePermission } from "@/lib/permissions/authorization";

beforeEach(() => {
  vi.mocked(requirePagePermission).mockReset();
  fixture.manage = true;
  fixture.archive = true;
  fixture.list.mockClear();
  fixture.list.mockImplementation(async () => ({
    rows: [
      {
        id: "shared",
        name: "Application form",
        mimeType: "application/pdf",
        fileSizeBytes: 1200,
        createdAt: new Date("2026-11-20"),
        creatorFirstName: "Admin",
        creatorLastName: "User",
      },
    ],
    canManage: fixture.manage,
    canArchive: fixture.archive,
    total: 1,
    pages: 1,
  }));
});

it("blocks opening Archive directly when the individual lacks archive permission", async () => {
  vi.mocked(requirePagePermission).mockImplementation(async (permission) => {
    if (permission === "documents.archive") throw new Error("Forbidden");
    return {
      authUserId: "auth",
      userId: "user",
      organizationId: "org",
      roles: [],
      permissions: new Set(["documents.view"]),
    };
  });
  await expect(ArchivePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("Forbidden");
  expect(fixture.list).not.toHaveBeenCalled();
});

it.each([true, false])("shows the shared library with admin management %s", async (manage) => {
  fixture.manage = manage;
  fixture.archive = manage;
  const html = renderToStaticMarkup(
    await DocumentsPage({ searchParams: Promise.resolve({ search: "Application" }) }),
  );
  expect(fixture.list).toHaveBeenCalledWith({ page: 1, search: "Application", shared: true });
  for (const text of ["Application form", "Uploaded by", "Admin User", "Open", "Download"])
    expect(html).toContain(text);
  expect(html.includes("Upload file")).toBe(manage);
  expect(html.includes("Archive file")).toBe(manage);
  expect(html).toContain('aria-label="Open Application form"');
  expect(html).toContain('aria-label="Download Application form"');
  expect(html).toContain('href="/api/documents/shared/download"');
  expect(html).not.toContain("<th>Contact</th>");
  expect(html.match(/<th\b/g)).toHaveLength(4);
});

it.each([
  [true, false],
  [false, true],
])("controls uploads (%s) separately from archive (%s)", async (manage, archive) => {
  fixture.manage = manage;
  fixture.archive = archive;
  const html = renderToStaticMarkup(await DocumentsPage({ searchParams: Promise.resolve({}) }));
  expect(html.includes("Upload file")).toBe(manage);
  expect(html.includes("Archive file")).toBe(archive);
  expect(html.includes('href="/documents/archive"')).toBe(archive);
});

it("shows image metadata for uploaded images", async () => {
  const data = await fixture.list();
  data.rows[0].mimeType = "image/png";
  fixture.list.mockResolvedValueOnce(data);
  const html = renderToStaticMarkup(await DocumentsPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Image");
});
