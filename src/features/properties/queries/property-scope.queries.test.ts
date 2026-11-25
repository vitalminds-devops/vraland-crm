import { expect, it, vi } from "vitest";
import { canWriteProperty } from "./property-scope.queries";

const select = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { select } }));

it("refuses a malformed property id without asking the database", async () => {
  const context = { organizationId: "org", userId: "me" } as Parameters<typeof canWriteProperty>[0];
  expect(await canWriteProperty(context, "not-an-id")).toBe(false);
  expect(select).not.toHaveBeenCalled();
});
