import { describe, expect, it } from "vitest";
import { propertyPageActions } from "./property-page-actions";

const context = (permissions: string[]) => ({
  authUserId: "auth",
  userId: "user",
  organizationId: "org",
  roles: [],
  permissions: new Set(permissions),
});

const all = [
  "properties.update",
  "properties.delete",
  "properties.manage_units",
  "properties.manage_unit_pictures",
];

describe("propertyPageActions", () => {
  it("follows each permission when the property is in reach", () => {
    expect(propertyPageActions(context(all), true)).toEqual({
      canEdit: true,
      canArchive: true,
      canManageUnits: true,
      canManageUnitPictures: true,
    });
    expect(propertyPageActions(context(["properties.update"]), true)).toEqual({
      canEdit: true,
      canArchive: false,
      canManageUnits: false,
      canManageUnitPictures: false,
    });
  });

  it("hides every write button when the property is out of reach", () => {
    expect(Object.values(propertyPageActions(context(all), false))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
