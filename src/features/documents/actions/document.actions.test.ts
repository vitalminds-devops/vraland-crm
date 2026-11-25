import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { canAccessResource } from "@/lib/permissions/authorization";

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  transaction: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  roles: ["agent"],
  permissions: new Set<string>(),
}));
vi.mock("@/lib/storage/document-storage", () => ({
  getDocumentStorage: () => ({ put: mocks.put, remove: mocks.remove }),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const name of ["from", "where", "leftJoin"]) chain[name] = () => chain;
      chain.limit = async () => [mocks.row];
      return chain;
    },
    transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async (permission: string) => {
    if (!mocks.permissions.has(permission)) throw new Error("Forbidden");
    return {
      organizationId: "org",
      userId: "actor",
      roles: mocks.roles,
      permissions: mocks.permissions,
    };
  }),
  canAccessResource: vi.fn(),
}));
vi.mock("../lib/document-scope", () => ({
  documentScope: () => undefined,
  sensitiveDocumentCondition: () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { contactDocumentRequirements, documents } from "@/db/schema";
import { archiveDocument, restoreDocument, uploadDocument } from "./document.actions";
import { uploadRequirementDocument } from "@/features/contacts/actions/requirement.actions";

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.roles = ["agent"];
  mocks.permissions = new Set([
    "documents.view",
    "documents.manage",
    "documents.archive",
    "requirements.manage",
  ]);
  mocks.put.mockReset().mockResolvedValue(undefined);
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

function sharedUpload() {
  const form = new FormData();
  form.set("library", "shared");
  form.set("documentType", "general");
  for (const field of ["contactId", "propertyId", "dealId"]) form.set(field, "");
  form.set("file", new File(["%PDF-1.7\n"], "Application form.pdf", { type: "application/pdf" }));
  return form;
}

it("rejects shared uploads without Manage shared files, even with documents.manage", async () => {
  expect(await uploadDocument(sharedUpload())).toMatchObject({
    success: false,
    error: { code: "PERMISSION_DENIED" },
  });
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("stores an admin's shared file without client links or sensitivity", async () => {
  mocks.roles = ["administrator"];
  mocks.permissions.add("documents.manage_shared");
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  mocks.transaction.mockImplementation(async (work) =>
    work({
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserts.push({ table, values });
          return { returning: async () => [{ id: "shared" }] };
        },
      }),
    }),
  );
  expect(await uploadDocument(sharedUpload())).toMatchObject({ success: true });
  expect(inserts.find((entry) => entry.table === documents)?.values).toMatchObject({
    category: "shared_file",
    documentType: "general",
    isSensitive: false,
    name: "Application form.pdf",
    organizationId: "org",
    contactId: null,
    propertyId: null,
    dealId: null,
  });
});

it("rejects client-linked files in the shared library", async () => {
  mocks.roles = ["administrator"];
  mocks.permissions.add("documents.manage_shared");
  const form = sharedUpload();
  form.set("contactId", "11111111-1111-4111-8111-111111111111");
  expect(await uploadDocument(form)).toMatchObject({ success: false });
  expect(mocks.put).not.toHaveBeenCalled();
});

it("rejects non-printable formats in the shared library", async () => {
  mocks.roles = ["administrator"];
  mocks.permissions.add("documents.manage_shared");
  const form = sharedUpload();
  form.set("file", new File(["Text"], "notes.txt", { type: "text/plain" }));
  expect(await uploadDocument(form)).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("unsupported file type") },
  });
  expect(mocks.put).not.toHaveBeenCalled();
});

it.each([archiveDocument, restoreDocument])(
  "allows non-admins with archive permission to archive or restore a shared file",
  async (action) => {
    mocks.row = { id: "shared", category: "shared_file", name: "Shared", archivedAt: new Date() };
    mocks.transaction.mockResolvedValue(undefined);
    mocks.permissions.delete("documents.manage");
    expect(await action("shared")).toMatchObject({ success: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  },
);

it.each([archiveDocument, restoreDocument])(
  "denies document archive actions when the permission is removed, including administrators",
  async (action) => {
    mocks.roles = ["administrator"];
    mocks.permissions.add("documents.manage_shared");
    mocks.permissions.delete("documents.archive");
    await expect(action("shared")).rejects.toThrow("Forbidden");
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);

it.each([archiveDocument, restoreDocument])(
  "requires document viewing as well as archive permission",
  async (action) => {
    mocks.permissions.delete("documents.view");
    expect(await action("shared")).toMatchObject({
      success: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  },
);

it.each(["document", "checklist"])(
  "keeps a committed %s upload if refreshing fails",
  async (kind) => {
    const form = new FormData();
    form.set("file", new File(["%PDF-1.7\n"], "id.pdf", { type: "application/pdf" }));
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("documentType", "general");
    for (const field of ["contactId", "propertyId", "dealId"]) form.set(field, "");
    mocks.row = { id: "requirement", contactId: "contact", label: "Valid ID" };
    vi.mocked(canAccessResource).mockResolvedValue(true);
    mocks.transaction.mockResolvedValue(kind === "document" ? "document" : undefined);
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("refresh failed");
    });
    const upload = kind === "document" ? uploadDocument : uploadRequirementDocument;
    expect(await upload(form)).toMatchObject({ success: true });
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

it.each([
  ["empty.pdf", "application/pdf", "", "is empty"],
  ["renamed.pdf", "application/pdf", "not a PDF", "contents do not match"],
  ["picture.gif", "image/gif", "GIF89a", "unsupported file type"],
])(
  "explains why %s was rejected before creating any records",
  async (name, type, body, message) => {
    for (const upload of [uploadDocument, uploadRequirementDocument]) {
      const form = new FormData();
      form.set("id", "11111111-1111-4111-8111-111111111111");
      form.set("documentType", "general");
      for (const field of ["contactId", "propertyId", "dealId"]) form.set(field, "");
      form.set("file", new File([body], name, { type }));
      expect(await upload(form)).toMatchObject({
        success: false,
        error: { message: expect.stringContaining(message) },
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  },
);

it("refuses to restore a document that is not archived", async () => {
  mocks.row = { id: "doc", status: "draft", name: "ID", archivedAt: null };
  const result = await restoreDocument("doc");
  expect(result).toMatchObject({
    success: false,
    error: { message: "This document is not archived." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("restores an archived document", async () => {
  mocks.row = { id: "doc", status: "archived", name: "ID", archivedAt: new Date() };
  mocks.transaction.mockResolvedValue(undefined);
  expect((await restoreDocument("doc")).success).toBe(true);
  expect(mocks.transaction).toHaveBeenCalledOnce();
});

it("refuses to restore an expired lead's document", async () => {
  mocks.row = {
    id: "doc",
    status: "archived",
    name: "ID",
    archivedAt: new Date(),
    contactExpired: true,
  };
  expect(await restoreDocument("doc")).toMatchObject({
    success: false,
    error: { message: "This document belongs to an expired lead and stays archived." },
  });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("reopens the checklist requirement an archived document filled", async () => {
  mocks.row = { id: "doc", status: "final", name: "ID" };
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];
  mocks.transaction.mockImplementation(async (work) =>
    work({
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => {
          updates.push({ table, values });
          return { where: async () => [] };
        },
      }),
      insert: () => ({ values: async () => [] }),
    }),
  );
  expect((await archiveDocument("doc")).success).toBe(true);
  expect(updates.find((u) => u.table === contactDocumentRequirements)?.values).toMatchObject({
    documentId: null,
    status: "not_submitted",
  });
});
