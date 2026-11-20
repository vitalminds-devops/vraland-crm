import { beforeEach, expect, it, vi } from "vitest";
import { setPropertyGrant } from "./property-access.actions";
import { readGrantTargets } from "../queries/property-access.queries";

const mock = vi.hoisted(() => {
  const state = {
    reads: [] as unknown[][],
    transactionReads: [] as unknown[][],
    writes: [] as unknown[],
    unrestricted: true,
  };
  function query(rows: unknown[] = []) {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      for: () => chain,
      returning: () => Promise.resolve([{ id: "grant" }]),
      onConflictDoUpdate: () => chain,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  }
  return { state, query };
});

vi.mock("@/db", () => ({
  db: {
    select: () => mock.query(mock.state.reads.shift()),
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        select: () => mock.query(mock.state.transactionReads.shift()),
        insert: () => ({
          values: (values: unknown) => {
            mock.state.writes.push(values);
            return mock.query();
          },
        }),
        delete: () => mock.query(),
      }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/authorization", () => ({
  requirePermission: async () => ({ organizationId: "organization", userId: "manager" }),
}));
vi.mock("@/lib/permissions/policy", () => ({
  canGrantUnitAccess: () => true,
  hasUnrestrictedInventoryAccess: () => mock.state.unrestricted,
}));
vi.mock("@/lib/permissions/property-access", () => ({
  grantableUserCondition: vi.fn(),
  grantedPropertyCondition: vi.fn(),
}));
vi.mock("@/lib/permissions/scope", () => ({ dataScopeCondition: vi.fn() }));
vi.mock("../queries/property-access.queries", () => ({ readGrantTargets: vi.fn() }));

const propertyId = "12345678-1234-4234-8234-123456789abc";
const userId = "22345678-1234-4234-8234-123456789abc";
const unitId = "32345678-1234-4234-8234-123456789abc";
const floorId = "42345678-1234-4234-8234-123456789abc";
const parkingSlotId = "52345678-1234-4234-8234-123456789abc";
const unit = { id: unitId, floorId };

beforeEach(() => {
  mock.state.reads = [
    [{ id: userId, firstName: "Buyer", lastName: "Test" }],
    [{ id: propertyId, title: "Tower" }],
  ];
  mock.state.transactionReads = [];
  mock.state.writes = [];
  mock.state.unrestricted = true;
});

it("inherits the granter's hidden exclusions when sharing a floor", async () => {
  mock.state.unrestricted = false;
  vi.mocked(readGrantTargets).mockResolvedValue({
    floorIds: [floorId],
    unitIds: [],
    excludedUnitIds: [unitId],
    parkingSlotIds: [],
  });
  mock.state.reads.push([{ id: floorId }], [unit]);
  mock.state.transactionReads = [[], []];
  expect(await setPropertyGrant({ propertyId, userId, floorIds: [floorId] })).toMatchObject({
    success: true,
  });
  expect(mock.state.writes).toContainEqual(
    expect.arrayContaining([
      expect.objectContaining({ floorId }),
      expect.objectContaining({ unitId, isExclusion: true }),
    ]),
  );
});

it("still rejects explicitly sharing a unit excluded from the granter's access", async () => {
  mock.state.unrestricted = false;
  vi.mocked(readGrantTargets).mockResolvedValue({
    floorIds: [floorId],
    unitIds: [],
    excludedUnitIds: [unitId],
    parkingSlotIds: [],
  });
  mock.state.reads.push([unit]);
  expect(await setPropertyGrant({ propertyId, userId, unitIds: [unitId] })).toMatchObject({
    success: false,
  });
  expect(mock.state.writes).toEqual([]);
});

it("rejects newly selected unavailable units before writing a grant", async () => {
  mock.state.reads.push([unit]);
  mock.state.transactionReads = [[], [unit]];
  expect(await setPropertyGrant({ propertyId, userId, unitIds: [unitId] })).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("units cannot be newly selected") },
  });
  expect(mock.state.writes).toEqual([]);
});

it("rejects newly selected unavailable parking before writing a grant", async () => {
  mock.state.reads.push([{ id: parkingSlotId }]);
  mock.state.transactionReads = [[], [{ id: parkingSlotId }]];
  expect(
    await setPropertyGrant({ propertyId, userId, parkingSlotIds: [parkingSlotId] }),
  ).toMatchObject({
    success: false,
    error: { message: expect.stringContaining("parking slots cannot be newly selected") },
  });
  expect(mock.state.writes).toEqual([]);
});

it("preserves previously granted units and parking after they become unavailable", async () => {
  mock.state.reads.push([unit], [{ id: parkingSlotId }]);
  mock.state.transactionReads = [
    [{ id: "grant" }],
    [
      { unitId, floorId: null, parkingSlotId: null, isExclusion: false },
      { unitId: null, floorId: null, parkingSlotId, isExclusion: false },
    ],
    [unit],
    [{ id: parkingSlotId }],
  ];
  expect(
    await setPropertyGrant({
      propertyId,
      userId,
      unitIds: [unitId],
      parkingSlotIds: [parkingSlotId],
    }),
  ).toMatchObject({ success: true });
  expect(mock.state.writes).toContainEqual([
    { grantId: "grant", unitId },
    { grantId: "grant", parkingSlotId },
  ]);
});

it("excludes newly unavailable units when a whole floor is selected", async () => {
  mock.state.reads.push([{ id: floorId }]);
  mock.state.transactionReads = [[], [unit]];
  expect(await setPropertyGrant({ propertyId, userId, floorIds: [floorId] })).toMatchObject({
    success: true,
  });
  expect(mock.state.writes).toContainEqual([
    { grantId: "grant", floorId },
    { grantId: "grant", unitId, isExclusion: true },
  ]);
});

it("does not restore unavailable units that were excluded from a previous floor grant", async () => {
  mock.state.reads.push([unit]);
  mock.state.transactionReads = [
    [{ id: "grant" }],
    [
      { floorId, unitId: null, parkingSlotId: null, isExclusion: false },
      { floorId: null, unitId, parkingSlotId: null, isExclusion: true },
    ],
    [unit],
  ];
  expect(await setPropertyGrant({ propertyId, userId, unitIds: [unitId] })).toMatchObject({
    success: false,
  });
  expect(mock.state.writes).toEqual([]);
});
