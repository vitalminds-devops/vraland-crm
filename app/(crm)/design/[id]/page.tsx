import Link from "next/link";
import { Layers3, Palette, Shapes } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils/cn";
import { FloorsAndUnits } from "@/features/properties";
import { UnitTypesPanel } from "@/features/properties/components/unit-types-panel";
import { UnitNamingPanel } from "@/features/properties/components/unit-naming-panel";
import { FloorSetupPanel } from "@/features/properties/components/floor-setup-panel";
import { unitEndings } from "@/features/properties/lib/floor-groups";
import { propertyPageActions } from "@/features/properties/lib/property-page-actions";
import { canWriteProperty } from "@/features/properties/queries/property-scope.queries";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import { getPropertyInventory } from "@/features/properties/queries/property-floor-unit.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

const tabs = [
  { key: "units", label: "Unit types", Icon: Shapes },
  { key: "floors", label: "Floors", Icon: Layers3 },
  { key: "groups", label: "Sections", Icon: Palette },
] as const;

/** Where a property's unit types, floor layouts and parking are designed, apart from its details. */
export default async function PropertyDesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requirePagePermission("properties.view");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = tabs.find((option) => option.key === query.tab)?.key ?? "units";
  const [inventory, parking, canWrite] = await Promise.all([
    getPropertyInventory(context, id),
    listParkingSlots(context, id),
    canWriteProperty(context, id),
  ]);
  if (!inventory.property) notFound();
  // Designing changes units and parking, so only people who manage them get here.
  const actions = propertyPageActions(context, canWrite);
  if (!actions.canManageUnits) redirect(`/properties/${id}`);
  const property = inventory.property;

  return (
    <PageContainer className={tab === "floors" ? "max-w-none" : "max-w-[1280px]"}>
      <PageHeader
        title={`Design ${property.title}`}
        description={property.propertyCode}
        actions={
          <>
            <nav
              aria-label="Design"
              className="flex rounded-lg border border-border bg-muted/40 p-0.5"
            >
              {tabs.map(({ key, label, Icon }) => (
                <Link
                  key={key}
                  href={`/design/${id}?tab=${key}`}
                  scroll={false}
                  aria-current={tab === key ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    tab === key && "bg-card text-foreground shadow-sm",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <BackButton fallbackHref={`/properties/${id}`} label="Back to property" />
          </>
        }
      />

      {tab === "units" && (
        <div className="space-y-4">
          {/* Units and parking are both designed once here, then placed on floors. */}
          <Panel>
            <UnitTypesPanel
              propertyId={id}
              unitTypes={inventory.unitTypes}
              currency={property.currency}
              parkingTypes={property.parkingTypes}
              canManagePrices={actions.canManagePrices}
            />
          </Panel>
        </div>
      )}
      {tab === "groups" && (
        <Panel>
          <UnitNamingPanel
            propertyId={id}
            floors={inventory.floors}
            floorGroups={property.floorGroups}
            unitEndings={unitEndings(inventory.units, inventory.floors)}
          />
        </Panel>
      )}
      {tab === "floors" && !inventory.floors.length && (
        <Panel title="Floors" flush>
          <FloorSetupPanel propertyId={id} style={property.unitNumbering?.style} />
        </Panel>
      )}
      {tab === "floors" && inventory.floors.length > 0 && (
        <Panel title="Floors, units & parking" flush>
          <FloorsAndUnits
            propertyId={id}
            canManageUnits
            canManagePrices={actions.canManagePrices}
            canDesign
            floors={inventory.floors}
            units={inventory.units}
            unitTypes={inventory.unitTypes}
            numbering={property.unitNumbering}
            propertyType={property.propertyType}
            parkingSlots={parking}
            parkingTypes={property.parkingTypes}
            floorGroups={property.floorGroups}
          />
        </Panel>
      )}
    </PageContainer>
  );
}
