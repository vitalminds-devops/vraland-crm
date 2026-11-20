import { expect, it, vi } from "vitest";
import { GET } from "../../../../app/api/documents/[id]/download/route";

vi.mock("@/lib/permissions/authorization", () => ({ AuthorizationError: class extends Error {} }));

vi.mock("@/lib/http/file-route", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/http/file-route")>("@/lib/http/file-route");
  return {
    ...actual,
    loadFileRecord: async () => ({
      id: "file",
      name: "Application form",
      category: "shared_file",
      mimeType: "application/pdf",
      storageKey: "private/file.pdf",
    }),
  };
});
vi.mock("@/features/documents/queries/document.queries", () => ({ getDownloadRecord: vi.fn() }));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ get: async () => Buffer.from("%PDF-1.7\n") }),
}));

it.each([false, true])("serves shared PDFs with a PDF filename and inline=%s", async (inline) => {
  const response = await GET(
    new Request(`http://localhost/api/documents/file/download${inline ? "?inline=1" : ""}`),
    { params: Promise.resolve({ id: "file" }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toContain(
    `${inline ? "inline" : "attachment"}; filename="Application form.pdf"`,
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  if (inline)
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "sandbox allow-modals allow-downloads",
    );
  expect(await response.text()).toBe("%PDF-1.7\n");
});
