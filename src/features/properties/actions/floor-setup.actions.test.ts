import { beforeEach, expect, it, vi } from "vitest";
import { requirePermission } from "@/lib/permissions/authorization";
import { createFloors, HasFloorsError } from "../lib/floor-setup";
import { canWriteProperty } from "../lib/property-scope";
import { setUpFloors } from "./floor-setup.actions";

const insert = vi.hoisted(() => vi.fn(() => ({ values: async () => {} })));
vi.mock("@/db", () => ({
  db: { transaction: async (work: (tx: unknown) => unknown) => work({ insert }) },
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: vi.fn(async () => ({ organizationId: "organization", userId: "user" })),
}));
vi.mock("../lib/property-scope", () => ({ canWriteProperty: vi.fn(async () => true) }));
vi.mock("../lib/revalidate-property", () => ({ revalidateProperty: vi.fn() }));
vi.mock("../lib/floor-setup", () => ({
  createFloors: vi.fn(async () => [1, 2, 3]),
  HasFloorsError: class extends Error {},
}));

const propertyId = "88f50ab3-567a-4a37-9271-eaa92a221995";
const setup = { fromLevel: 1, toLevel: 3, skipFloors: [], style: "number", endings: [] };

beforeEach(() => vi.clearAllMocks());

it("builds the floors for people who manage units on a property they can change", async () => {
  expect((await setUpFloors(propertyId, setup)).success).toBe(true);
  expect(requirePermission).toHaveBeenCalledWith("properties.manage_units");
  expect(createFloors).toHaveBeenCalledWith(expect.anything(), propertyId, setup);
  expect(insert).toHaveBeenCalledTimes(1);
});

it("refuses a property out of reach, bad floors, or one that already has floors", async () => {
  vi.mocked(canWriteProperty).mockResolvedValueOnce(false);
  expect((await setUpFloors(propertyId, setup)).success).toBe(false);
  expect((await setUpFloors(propertyId, { ...setup, toLevel: "x" })).success).toBe(false);
  expect(createFloors).not.toHaveBeenCalled();

  vi.mocked(createFloors).mockRejectedValueOnce(new HasFloorsError());
  const result = await setUpFloors(propertyId, setup);
  expect(!result.success && result.error.message).toBe("This property already has floors.");
});
