import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  transaction: vi.fn(),
}));
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
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "actor" })),
  canAccessResource: vi.fn(),
}));
vi.mock("../lib/document-scope", () => ({
  documentScope: () => undefined,
  sensitiveDocumentCondition: () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { contactDocumentRequirements } from "@/db/schema";
import { archiveDocument, restoreDocument } from "./document.actions";

beforeEach(() => {
  mocks.transaction.mockReset();
});

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
