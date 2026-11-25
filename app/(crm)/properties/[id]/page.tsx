import { ArrowLeft, ArrowRight, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { RecordTable, RecordTd, RecordTh } from "@/components/common/record-table";
import { buttonVariants } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { TableBody, TableRow } from "@/components/ui/table";
import { FloorsAndUnits, ParkingSlots } from "@/features/properties";
import { PropertyActionsMenu } from "@/features/properties/components/property-actions-menu";
import { NO_FLOOR } from "@/features/properties/lib/parking-codes";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import { getPropertyInventory } from "@/features/properties/queries/property-floor-unit.queries";
import { getProperty } from "@/features/properties/queries/property.queries";
import { accessPageMode } from "@/features/properties/lib/access-page-mode";
import { propertyPageActions } from "@/features/properties/lib/property-page-actions";
import { canWriteProperty } from "@/features/properties/queries/property-scope.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ presentation?: string | string[] }>;
}) {
  const context = await requirePagePermission("properties.view");
  const { id } = await params;
  const presenting = (await searchParams).presentation === "true";
  const [data, inventory, parking, canWrite] = await Promise.all([
    getProperty(id),
    getPropertyInventory(context, id),
    listParkingSlots(context, id),
    canWriteProperty(context, id),
  ]);
  if (!data || !inventory.property) notFound();
  const p = data.record;
  const actions = propertyPageActions(context, canWrite);

  const address =
    [p.addressLine1, p.addressLine2, p.barangay, p.city, p.province, p.postalCode]
      .filter(Boolean)
      .join(", ") || null;

  const presentationAction = (
    <Link
      href={`/properties/${id}`}
      scroll={true}
      className={`${buttonVariants({ variant: "secondary" })} gap-2`}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Exit presentation
    </Link>
  );

  const historyContent = data.history.length > 0 && (
    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Property history</DialogTitle>
        <DialogDescription>
          {data.history.length} {data.history.length === 1 ? "change" : "changes"}
        </DialogDescription>
      </DialogHeader>
      <RecordTable
        className="min-w-0"
        head={
          <TableRow>
            <RecordTh className="whitespace-nowrap">When</RecordTh>
            <RecordTh>Change</RecordTh>
            <RecordTh className="hidden sm:table-cell">Changed by</RecordTh>
            <RecordTh>Note</RecordTh>
          </TableRow>
        }
      >
        <TableBody className="divide-y divide-border/40">
          {data.history.map((item) => (
            <TableRow key={item.id} className="align-top">
              <RecordTd className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(item.changedAt)}
              </RecordTd>
              <RecordTd>
                <span className="flex items-center gap-1.5">
                  {item.fromStatus && (
                    <>
                      <span className="text-muted-foreground">{label(item.fromStatus)}</span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    </>
                  )}
                  <span className="font-medium">{label(item.toStatus)}</span>
                </span>
              </RecordTd>
              <RecordTd className="hidden text-muted-foreground sm:table-cell">
                {person(item.changedByFirstName, item.changedByLastName) ?? "System"}
              </RecordTd>
              <RecordTd className="text-muted-foreground">{item.note || "—"}</RecordTd>
            </TableRow>
          ))}
        </TableBody>
      </RecordTable>
    </DialogContent>
  );

  // The address rides on the floor view's card, so the page is nothing but the floors.
  const addressLine = address && (
    <div className="flex min-w-0 items-start gap-2 text-[13px] leading-6">
      <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <address className="break-words not-italic">{address}</address>
        <a
          href={`https://www.google.com/maps?q=${encodeURIComponent(p.latitude && p.longitude ? `${p.latitude},${p.longitude}` : address)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View on map <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </div>
  );

  const pageActions = presenting ? (
    <>
      {addressLine}
      <p className="text-sm font-semibold tracking-wide text-primary">VRA LAND INC.</p>
      {presentationAction}
    </>
  ) : undefined;
  // Actions and Back float over the floor view's top-right corner.
  const floorActions = presenting ? null : (
    <>
      <PropertyActionsMenu
        propertyId={id}
        title={p.title}
        canEdit={actions.canEdit}
        canDesign={actions.canManageUnits}
        canAccess={Boolean(accessPageMode(context))}
        canArchive={actions.canArchive}
        history={historyContent}
      />
      <BackButton fallbackHref="/properties" label="Back to properties" />
    </>
  );

  return (
    <div data-property-presentation={presenting}>
      <PageContainer
        className={`flex min-h-0 max-w-none flex-col ${
          presenting
            ? "h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] sm:h-dvh"
            : "h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] sm:h-[calc(100dvh-4rem)]"
        }`}
      >
        <PageHeader
          title={p.title}
          description={`${label(p.status)} · ${p.propertyCode}`}
          actions={pageActions}
        />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {/* The floor view is the page: no card title, it fills the screen like the editor. */}
          <section
            id="floors-units"
            aria-label="Floors, units and parking"
            className="h-full overflow-hidden rounded-xl border border-border/60 bg-card"
          >
            <FloorsAndUnits
              immersive
              overlayInfo={presenting ? null : addressLine}
              overlayActions={floorActions}
              propertyId={id}
              canManagePrices={!presenting && actions.canManagePrices}
              canManageUnits={!presenting && actions.canManageUnits}
              canManageUnitPictures={!presenting && actions.canManageUnitPictures}
              floors={inventory.floors}
              units={inventory.units}
              unitTypes={inventory.unitTypes}
              numbering={inventory.property.unitNumbering}
              parkingSlots={parking}
              parkingTypes={inventory.property.parkingTypes}
              floorGroups={inventory.property.floorGroups}
              propertyType={inventory.property.propertyType}
              currency={p.currency}
            />
          </section>

          {/* Parking lives with its floor above; only slots on no floor need their own place. */}
          {parking.some((slot) => !slot.floorId) && (
            <Panel title="Parking without a floor" id="parking">
              <ParkingSlots
                propertyId={id}
                slots={parking}
                floors={inventory.floors}
                canManage={!presenting && actions.canManageUnits}
                currency={p.currency}
                onlyFloor={NO_FLOOR}
              />
            </Panel>
          )}

          {data.features.length > 0 && (
            <Panel title="Features">
              <ul className="flex flex-wrap gap-2">
                {data.features.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-full border border-border/60 bg-muted/60 px-2.5 py-1 text-[13px]"
                  >
                    {v.name}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </PageContainer>
    </div>
  );
}

/** "First Last", or `null` when no one is named, so callers can fall back. */
function person(first: string | null, last: string | null): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || null;
}

function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
