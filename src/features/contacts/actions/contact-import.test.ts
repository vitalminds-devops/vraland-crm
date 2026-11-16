import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reachable: false }));
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {};
  for (const name of ["values", "set", "where"]) chain[name] = () => chain;
  chain.returning = async () => [{ id: "job" }];
  chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return {
    db: {
      insert: () => chain,
      update: () => chain,
      transaction: async (work: (tx: unknown) => unknown) => work({}),
    },
  };
});
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "org", userId: "importer" })),
  canAccessResource: vi.fn(async () => mocks.reachable),
}));
vi.mock("../lib/contact-csv", () => ({
  parseContactCsvRow: () => ({
    success: true,
    data: { firstName: "Ana", lastName: "Cruz", email: "ana@example.com" },
  }),
}));
vi.mock("../lib/contact-duplicate-lookup", () => ({
  findDuplicateMatch: async () => ({
    kind: "exact",
    reason: "email",
    contact: { id: "hidden-contact", contactCode: "C-0042" },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
import { importContactsCsv } from "./contact.actions";

const csv = () => {
  const form = new FormData();
  form.set("file", new File(["first_name,last_name\nAna,Cruz\n"], "contacts.csv"));
  return form;
};

beforeEach(() => {
  mocks.reachable = false;
});

it("rejects a duplicate outside the importer's access without revealing it", async () => {
  const result = await importContactsCsv(csv());
  const text = JSON.stringify(result);
  expect(text).toContain("already on a contact outside your access");
  expect(text).not.toContain("C-0042");
  expect(text).not.toContain("hidden-contact");
});

it("names a duplicate the importer can access", async () => {
  mocks.reachable = true;
  const text = JSON.stringify(await importContactsCsv(csv()));
  expect(text).toContain("is already on C-0042");
  expect(text).toContain('"created":0');
});
