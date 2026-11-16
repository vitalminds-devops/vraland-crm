import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PropertyDetailPage from "../../../../app/(crm)/properties/[id]/page";

const fixture = vi.hoisted(() => ({
  permissions: new Set<string>(),
  canWrite: true,
  data: {
    record: {
      title: "QA Tower 1",
      propertyCode: "PROP-QA",
      propertyType: "condominium",
      listingType: "sale",
      status: "active",
      currency: "PHP",
      askingPrice: "2300000",
      monthlyRent: null,
      parkingPrice: null as string | null,
      reservationFee: null,
      bedrooms: 2,
      bathrooms: "1",
      parkingSpaces: null,
      lotAreaSqm: null,
      floorAreaSqm: "42",
      listedAt: null,
      availableFrom: null,
      contractStartDate: null,
      contractEndDate: null,
      addressLine1: "Ortigas Avenue",
      addressLine2: null,
      barangay: null,
      city: "Pasig City",
      province: null,
      postalCode: null,
      latitude: null,
      longitude: null,
      description: "A bright city home.",
      floorCount: 1,
      unitsPerFloor: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    },
    features: [{ id: "pool", name: "Swimming pool" }],
    history: [
      {
        id: "history",
        fromStatus: "draft",
        toStatus: "active",
        changedAt: new Date("2026-01-02"),
        changedByFirstName: "Private",
        changedByLastName: "Agent",
        note: "Internal status note",
      },
    ],
  },
  inventory: {
    property: { id: "property" },
    floors: [{ id: "floor", label: "Floor 1", level: 1, unitCount: 1, imageStorageKey: null }],
    units: [
      { id: "unit", code: "1A", floorId: "floor", status: "available", imageStorageKey: null },
    ],
    omitted: { floors: 0, units: 0 },
  },
}));

vi.mock("@/lib/permissions/authorization", () => ({
  requirePagePermission: vi.fn(async () => ({ permissions: fixture.permissions })),
}));
vi.mock("@/features/properties/lib/access-page-mode", () => ({
  accessPageMode: () => (fixture.permissions.has("properties.update") ? "edit" : null),
}));
vi.mock("@/features/properties/lib/property-scope", () => ({
  canWriteProperty: vi.fn(async () => fixture.canWrite),
}));
vi.mock("@/features/properties/queries/property.queries", () => ({
  getProperty: vi.fn(async () => fixture.data),
}));
vi.mock("@/features/properties/queries/property-floor-unit.queries", () => ({
  getPropertyInventory: vi.fn(async () => fixture.inventory),
}));
vi.mock("@/features/properties/queries/parking.queries", () => ({
  listParkingSlots: vi.fn(async () => []),
}));
vi.mock("@/components/common/back-button", () => ({
  BackButton: () => createElement("button", null, "Back to properties"),
}));
vi.mock("@/components/common/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/features/properties", async () => ({
  ...(await import("../lib/constants")),
  FloorsAndUnits: (props: {
    canManageUnits: boolean;
    canManageUnitPictures: boolean;
    units: { code: string }[];
  }) =>
    createElement(
      "div",
      {
        "data-manage-units": props.canManageUnits,
        "data-manage-pictures": props.canManageUnitPictures,
      },
      props.units.map((unit) => unit.code).join(", "),
    ),
  ParkingSlots: () => null,
}));

async function render(presentation?: string | string[]) {
  return renderToStaticMarkup(
    await PropertyDetailPage({
      params: Promise.resolve({ id: "property" }),
      searchParams: Promise.resolve({ presentation }),
    }),
  );
}

describe("property presentation", () => {
  beforeEach(() => {
    fixture.data.record.parkingPrice = null;
    fixture.canWrite = true;
    fixture.permissions.clear();
    fixture.permissions.add("properties.update");
    fixture.permissions.add("properties.manage_units");
    fixture.permissions.add("properties.manage_unit_pictures");
  });

  it("keeps management available and history collapsed in the agent view", async () => {
    const html = await render();
    expect(html).toContain('data-property-presentation="false"');
    expect(html).toContain("Present to client");
    expect(html).toContain('href="/properties/property/edit"');
    expect(html).toContain('href="/properties/property/access"');
    expect(html).toContain('data-manage-units="true"');
    expect(html).toContain('data-manage-pictures="true"');
    expect(html).toContain("Internal status note");
    expect(html).not.toContain("<details open");
  });

  it("shows client details and inventory without editing controls or internal history", async () => {
    const html = await render("true");
    expect(html).toContain('data-property-presentation="true"');
    expect(html).toContain("Exit presentation");
    expect(html).toContain("QA Tower 1");
    expect(html).toContain("₱2,300,000");
    expect(html).toContain("42 sqm");
    expect(html).toContain("Swimming pool");
    expect(html).toContain("1A");
    expect(html).toContain('data-manage-units="false"');
    expect(html).toContain('data-manage-pictures="false"');
    expect(html).not.toContain("Internal status note");
    expect(html).not.toContain("Private Agent");
    expect(html).not.toContain("Added ");
    expect(html).not.toContain("/edit");
    expect(html).not.toContain("/access");
    expect(html).toContain("https://www.google.com/maps?q=Ortigas%20Avenue%2C%20Pasig%20City");
    expect(html).not.toContain("Monthly fee");
    expect(html.indexOf('aria-label="Property overview"')).toBeLessThan(
      html.indexOf('id="floors-units"'),
    );
  });

  it("does not grant editing permissions when exiting presentation", async () => {
    fixture.permissions.clear();
    const html = await render("false");
    expect(html).not.toContain("/edit");
    expect(html).not.toContain("/access");
    expect(html).toContain('data-manage-units="false"');
    expect(html).toContain('data-manage-pictures="false"');
  });

  it("hides write controls for a property outside the user's reach", async () => {
    fixture.canWrite = false;
    const html = await render();
    expect(html).not.toContain("/edit");
    expect(html).toContain('data-manage-units="false"');
    expect(html).toContain('data-manage-pictures="false"');
  });

  it("shows the parking price in the property's currency when presenting", async () => {
    fixture.data.record.parkingPrice = "350000";
    const html = await render("true");
    expect(html).toContain("Parking price");
    expect(html).toContain("₱350,000");
  });

  it("omits the parking price when none is set", async () => {
    expect(await render()).not.toContain("Parking price");
  });
});
