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
      parkingSlotLimit: 1,
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
      {
        id: "unit",
        code: "1A",
        floorId: "floor",
        status: "available",
        imageStorageKey: null,
        unitTypeId: null,
        floorArea: null,
        price: "2300000",
      },
    ],
    unitTypes: [],
    plans: [],
  },
}));

vi.mock("@/lib/permissions/authorization", () => ({
  requirePagePermission: vi.fn(async () => ({ permissions: fixture.permissions })),
}));
vi.mock("@/features/properties/lib/access-page-mode", () => ({
  accessPageMode: () => (fixture.permissions.has("properties.update") ? "edit" : null),
}));
vi.mock("@/features/properties/queries/property-scope.queries", () => ({
  canWriteProperty: vi.fn(async () => fixture.canWrite),
}));
vi.mock("@/features/properties/queries/property.queries", () => ({
  getProperty: vi.fn(async () => fixture.data),
}));
vi.mock("@/features/properties/queries/property-floor-unit.queries", () => ({
  getPropertyInventory: vi.fn(async () => fixture.inventory),
}));
vi.mock("@/features/properties/queries/billed-prices.queries", () => ({
  getBilledUnitPrices: async () => ({}),
}));
vi.mock("@/features/properties/queries/parking.queries", () => ({
  listParkingSlots: vi.fn(async () => []),
}));
vi.mock("@/components/common/back-button", () => ({
  BackButton: () => createElement("button", null, "Back to properties"),
}));
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
    createElement("header", null, title, actions),
}));
vi.mock("./property-actions-menu", () => ({
  PropertyActionsMenu: (props: {
    propertyId: string;
    canEdit: boolean;
    canAccess: boolean;
    canArchive: boolean;
    history: React.ReactNode;
  }) =>
    createElement(
      "div",
      { "data-property-actions-menu": true, "data-can-archive": props.canArchive },
      createElement("button", { "aria-haspopup": "menu" }, "Actions"),
      createElement(
        "a",
        { href: `/properties/${props.propertyId}?presentation=true` },
        "Present to client",
      ),
      props.canEdit && createElement("a", { href: `/properties/${props.propertyId}/edit` }, "Edit"),
      props.canAccess &&
        createElement("a", { href: `/properties/${props.propertyId}/access` }, "Access"),
      props.history && createElement("span", null, "History"),
    ),
}));
vi.mock("@/features/properties/components/floor-plans-panel", () => ({
  FloorPlansPanel: () => null,
}));
vi.mock("@/features/properties/components/unit-types-panel", () => ({
  UnitTypesPanel: () => null,
}));
vi.mock("@/features/properties", async () => ({
  ...(await import("../lib/constants")),
  FloorsAndUnits: (props: {
    canManageUnits: boolean;
    canManageUnitPictures: boolean;
    units: { code: string }[];
    overlayInfo?: React.ReactNode;
    overlayActions?: React.ReactNode;
  }) =>
    createElement(
      "div",
      {
        "data-manage-units": props.canManageUnits,
        "data-manage-pictures": props.canManageUnitPictures,
      },
      props.overlayInfo,
      props.overlayActions,
      props.units.map((unit) => unit.code).join(", "),
    ),
  ParkingSlots: (props: { price?: string | null }) =>
    createElement("p", { "data-parking-price": props.price ?? "" }),
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
    fixture.canWrite = true;
    fixture.permissions.clear();
    fixture.permissions.add("properties.update");
    fixture.permissions.add("properties.manage_units");
    fixture.permissions.add("properties.manage_unit_pictures");
  });

  it("groups presentation and permitted actions in the menu over the floor view", async () => {
    const html = await render();
    expect(html).toContain('data-property-presentation="false"');
    expect(html).toContain("Present to client");
    expect(html).toContain('href="/properties/property/edit"');
    expect(html).toContain('href="/properties/property/access"');
    expect(html).toContain('data-manage-units="true"');
    expect(html).toContain('data-manage-pictures="true"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('data-property-actions-menu="true"');
    expect(html).toContain("</div><button>Back to properties</button>");
    expect(html.indexOf("Present to client")).toBeGreaterThan(
      html.indexOf("data-property-actions-menu"),
    );
    expect(html.indexOf(">History<")).toBeGreaterThan(0);
    // The actions menu floats over the floor view now, not in the page header.
    expect(html.indexOf(">History<")).toBeGreaterThan(
      html.indexOf(`aria-label="Floors, units and parking"`),
    );
    expect(html).not.toContain("Internal status note");
    expect(html).not.toContain("<details");
  });

  it("shows client details and inventory without editing controls or internal history", async () => {
    const html = await render("true");
    expect(html).toContain('data-property-presentation="true"');
    expect(html).toContain("Exit presentation");
    expect(html).toContain("QA Tower 1");
    // Size and rooms belong to each unit now, not the property.
    expect(html).not.toContain("42 sqm");
    expect(html).toContain("Swimming pool");
    expect(html).toContain("1A");
    expect(html).toContain('data-manage-units="false"');
    expect(html).toContain('data-manage-pictures="false"');
    expect(html).not.toContain("Internal status note");
    expect(html).not.toContain("Private Agent");
    expect(html).not.toContain("Added ");
    expect(html).not.toContain("/edit");
    expect(html).not.toContain("/access");
    expect(html).not.toContain('data-property-actions-menu="true"');
    expect(html).toContain("https://www.google.com/maps?q=Ortigas%20Avenue%2C%20Pasig%20City");
    expect(html).not.toContain("Monthly fee");
    expect(html).not.toContain(">Address<");
    expect(html.indexOf("<address")).toBeLessThan(html.indexOf('id="floors-units"'));
    expect(html).toContain("<address");
    expect(html).toContain("Ortigas Avenue, Pasig City");
    expect(html).not.toContain("Parking slots");
    // The floor view is the page itself, with no card title or summary above it.
    expect(html).toContain(`aria-label="Floors, units and parking"`);
    expect(html).not.toContain("1 available");
    expect(html).not.toContain("A bright city home.");
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
    expect(html).toContain('data-can-archive="false"');
  });

  it("offers archive in the menu only with permission and access to the property", async () => {
    fixture.permissions.add("properties.delete");
    expect(await render()).toContain('data-can-archive="true"');
    fixture.canWrite = false;
    expect(await render()).toContain('data-can-archive="false"');
  });

  it("leaves unit prices to each unit's tag, with no property-wide price", async () => {
    const html = await render();
    expect(html).not.toContain("Unit prices");
    expect(html).not.toContain("Gross list price");
  });
});
