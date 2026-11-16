import { notFound, redirect } from "next/navigation";

import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { PropertyAccessEditor } from "@/features/properties";
import { accessPageMode } from "@/features/properties/lib/access-page-mode";
import {
  getPropertyInventory,
  getPropertyInventoryForGrants,
} from "@/features/properties/queries/property-floor-unit.queries";
import {
  getPropertyGrant,
  listAccessGrantees,
  listPropertyGrants,
} from "@/features/properties/queries/property-access.queries";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { hasUnrestrictedInventoryAccess } from "@/lib/permissions/policy";

/** "Who can see this property": which brokers and agents see it, and which floors and units. */
export default async function PropertyAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const context = await requirePagePermission("properties.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Granters manage access, "See everyone's property access" reads it; everyone else reads the units.
  const mode = accessPageMode(context);
  if (!mode) redirect(`/properties/${id}#floors-units`);

  const inventory = await getPropertyInventory(context, id);
  if (!inventory.property) notFound();
  const property = inventory.property;

  const editor =
    mode === "edit"
      ? await loadEditor(context, id, query.user ?? null, {
          floorIds: inventory.floors.map((floor) => floor.id),
          unitIds: inventory.units.map((unit) => unit.id),
        })
      : await loadViewer(id);

  return (
    <PageContainer>
      <PageHeader
        title="Who can see this property"
        description={`${property.title} · ${property.propertyCode}`}
        actions={<BackButton fallbackHref={`/properties/${id}`} label="Back to property" />}
      />

      <PropertyAccessEditor
        key={editor.selectedUserId ?? "none"}
        propertyId={id}
        propertyTitle={property.title}
        users={editor.users}
        grants={editor.grants}
        selectedUserId={editor.selectedUserId}
        floors={editor.floors}
        units={editor.units}
        parkingSlots={editor.parkingSlots}
        grant={editor.grant}
        canGrantEveryProperty={editor.canGrantEveryProperty}
        readOnly={mode === "view"}
      />
    </PageContainer>
  );
}

/** View only: who has access and how much; none of the grant tools. */
async function loadViewer(propertyId: string) {
  return {
    users: [],
    grants: await listPropertyGrants(propertyId),
    selectedUserId: null,
    floors: [],
    units: [],
    parkingSlots: [],
    grant: null,
    canGrantEveryProperty: false,
  };
}

async function loadEditor(
  context: Awaited<ReturnType<typeof requirePagePermission>>,
  propertyId: string,
  requestedUserId: string | null,
  /** The floors and units of the caller's own filtered inventory. */
  own: { floorIds: string[]; unitIds: string[] },
) {
  const [users, grants, full, parkingSlots] = await Promise.all([
    listAccessGrantees(),
    listPropertyGrants(propertyId),
    getPropertyInventoryForGrants(context, propertyId),
    listParkingSlots(context, propertyId, { includeHidden: true }),
  ]);

  const selectedUserId = users.some((user) => user.id === requestedUserId) ? requestedUserId : null;
  const grant = selectedUserId ? await getPropertyGrant(propertyId, selectedUserId) : null;

  const availableByFloor = new Map<string, number>();
  for (const unit of full.units)
    if (unit.status === "available")
      availableByFloor.set(unit.floorId, (availableByFloor.get(unit.floorId) ?? 0) + 1);

  const mineFloors = new Set(own.floorIds);
  const mineUnits = new Set(own.unitIds);

  return {
    users,
    grants,
    selectedUserId,
    floors: full.floors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      unitCount: floor.unitCount,
      availableUnits: availableByFloor.get(floor.id) ?? 0,
      hasAccess: mineFloors.has(floor.id),
    })),
    units: full.units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      status: unit.status,
      floorId: unit.floorId,
      imageStorageKey: unit.imageStorageKey,
      accessible: mineUnits.has(unit.id),
    })),
    parkingSlots,
    grant,
    canGrantEveryProperty: hasUnrestrictedInventoryAccess(context),
  };
}
