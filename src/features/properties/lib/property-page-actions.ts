import { hasPermission, type AuthorizationContext } from "@/lib/permissions/policy";

/**
 * Which write buttons to show for one property. `canWrite` is `canWriteProperty`,
 * the data-scope and access-grant check every property write action makes.
 */
export function propertyPageActions(context: AuthorizationContext, canWrite: boolean) {
  return {
    canEdit: canWrite && hasPermission(context, "properties.update"),
    canArchive: canWrite && hasPermission(context, "properties.delete"),
    canManageUnits: canWrite && hasPermission(context, "properties.manage_units"),
    canManagePrices: canWrite && hasPermission(context, "properties.manage_prices"),
    canManageUnitPictures: canWrite && hasPermission(context, "properties.manage_unit_pictures"),
  };
}
