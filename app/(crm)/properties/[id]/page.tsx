import {
  ArrowLeft,
  ArrowRight,
  Car,
  Edit3,
  ExternalLink,
  KeyRound,
  MapPin,
  Presentation,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { RecordTable, RecordTd, RecordTh } from "@/components/common/record-table";
import { buttonVariants } from "@/components/ui/button";
import { TableBody, TableRow } from "@/components/ui/table";
import {
  ArchivePropertyButton,
  cardClass,
  headClass,
  FloorsAndUnits,
  ParkingSlots,
} from "@/features/properties";
import { listParkingSlots } from "@/features/properties/queries/parking.queries";
import { getPropertyInventory } from "@/features/properties/queries/property-floor-unit.queries";
import { getProperty } from "@/features/properties/queries/property.queries";
import { accessPageMode } from "@/features/properties/lib/access-page-mode";
import { propertyPageActions } from "@/features/properties/lib/property-page-actions";
import { canWriteProperty } from "@/features/properties/lib/property-scope";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { cn } from "@/lib/utils/cn";

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

  // Only show prices and details that have a real value.
  const prices = [
    { label: "Gross list price", value: positive(p.askingPrice) },
    { label: "Monthly amortization", value: positive(p.monthlyRent) },
    { label: "Parking price", value: positive(p.parkingPrice) },
    { label: "Reservation fee", value: positive(p.reservationFee) },
  ].filter((price) => price.value !== null);
  const details = [
    { label: "Bedrooms", value: positive(p.bedrooms) },
    { label: "Bathrooms", value: positive(p.bathrooms) },
    { label: "Parking slots", value: positive(p.parkingSpaces) },
    { label: "Lot area", value: area(p.lotAreaSqm) },
    { label: "Floor area", value: area(p.floorAreaSqm) },
    { label: "Listed", value: date(p.listedAt) },
    { label: "Available", value: date(p.availableFrom) },
    { label: "Contract", value: contract(p.contractStartDate, p.contractEndDate) },
  ].filter((detail) => detail.value);

  const address =
    [p.addressLine1, p.addressLine2, p.barangay, p.city, p.province, p.postalCode]
      .filter(Boolean)
      .join(", ") || null;

  const presentationAction = (
    <Link
      href={presenting ? `/properties/${id}` : `/properties/${id}?presentation=true`}
      scroll={true}
      className={`${buttonVariants({ variant: presenting ? "secondary" : "primary" })} gap-2`}
    >
      {presenting ? (
        <ArrowLeft aria-hidden="true" className="size-4" />
      ) : (
        <Presentation aria-hidden="true" className="size-4" />
      )}
      {presenting ? "Exit presentation" : "Present to client"}
    </Link>
  );

  return (
    <div data-property-presentation={presenting}>
      <PageContainer className="max-w-[1280px]">
        <PageHeader title="Property details" description={p.propertyCode} />

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {presenting ? (
            <p className="text-sm font-semibold tracking-wide text-primary">VRA LAND INC.</p>
          ) : (
            presentationAction
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!presenting && accessPageMode(context) ? (
              <Link
                href={`/properties/${id}/access`}
                className={`${buttonVariants({ variant: "secondary" })} gap-2`}
              >
                <KeyRound aria-hidden="true" className="size-4" />
                Access
              </Link>
            ) : undefined}
            {!presenting && actions.canEdit ? (
              <Link
                href={`/properties/${id}/edit`}
                className={`${buttonVariants({ variant: "secondary" })} gap-2`}
              >
                <Edit3 aria-hidden="true" className="size-4" />
                Edit
              </Link>
            ) : undefined}
            {!presenting && actions.canArchive ? (
              <ArchivePropertyButton propertyId={id} title={p.title} />
            ) : undefined}
            {presenting ? (
              presentationAction
            ) : (
              <BackButton fallbackHref="/properties" label="Back to properties" />
            )}
          </div>
        </div>

        <div className="space-y-5">
          <section
            aria-label="Property overview"
            className="rounded-xl border border-border/60 bg-card p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
              <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {label(p.status)}
              </span>
            </div>
            {address && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span>{address}</span>
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(p.latitude && p.longitude ? `${p.latitude},${p.longitude}` : address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  View on map <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </p>
            )}

            {prices.length > 0 && (
              <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {prices.map((price) => (
                  <Stat
                    key={price.label}
                    label={price.label}
                    value={money(price.value, p.currency)}
                  />
                ))}
              </dl>
            )}

            {details.length > 0 && (
              <dl className="mt-4 flex flex-wrap gap-2">
                {details.map((detail) => (
                  <Info key={detail.label} label={detail.label} value={detail.value} />
                ))}
              </dl>
            )}

            {p.description && (
              <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {p.description}
              </p>
            )}
          </section>

          <Section title="Floors & units" id="floors-units">
            <FloorsAndUnits
              propertyId={id}
              propertyTitle={p.title}
              canManageUnits={!presenting && actions.canManageUnits}
              canManageUnitPictures={!presenting && actions.canManageUnitPictures}
              floorCount={p.floorCount}
              unitsPerFloor={p.unitsPerFloor}
              floors={inventory.floors}
              units={inventory.units}
              omitted={inventory.omitted}
            />
          </Section>

          {(parking.length > 0 || !presenting) && (
            <Section title="Parking" id="parking">
              <ParkingSlots
                propertyId={id}
                slots={parking}
                floors={inventory.floors}
                canManage={!presenting && actions.canManageUnits}
              />
            </Section>
          )}

          {data.features.length > 0 && (
            <Section title="Features">
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
            </Section>
          )}

          {!presenting && data.history.length > 0 && (
            <details className={cardClass}>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Property history
              </summary>
              <div className="mt-4">
                <RecordTable
                  head={
                    <TableRow>
                      <RecordTh className="whitespace-nowrap">When</RecordTh>
                      <RecordTh>Change</RecordTh>
                      <RecordTh className="hidden sm:table-cell">Changed by</RecordTh>
                      <RecordTh>Note</RecordTh>
                    </TableRow>
                  }
                  footer={`${data.history.length} status ${data.history.length === 1 ? "change" : "changes"}`}
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
                                <span className="text-muted-foreground">
                                  {label(item.fromStatus)}
                                </span>
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
              </div>
            </details>
          )}

          {!presenting && (
            <p className="text-xs text-muted-foreground">
              Added {formatDateTime(p.createdAt)} · Updated {formatDateTime(p.updatedAt)}
            </p>
          )}
        </div>
      </PageContainer>
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn(cardClass, "scroll-mt-20")}>
      <h2 className={headClass}>{title}</h2>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function Info({ label: caption, value }: { label: string; value: string | null }) {
  const parking = caption === "Parking slots";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
        parking ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 bg-muted/40",
      )}
    >
      <dt
        className={cn(
          "flex items-center gap-1.5",
          parking ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        {parking && <Car aria-hidden="true" className="size-4" />}
        {caption}
      </dt>
      <dd
        className={cn(
          "font-semibold tabular-nums",
          parking &&
            "min-w-6 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs text-primary-foreground",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Stat({ label: caption, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.04] px-4 py-3">
      <dt className="text-[13px] font-medium text-muted-foreground">{caption}</dt>
      <dd className="mt-0.5 text-xl leading-tight font-semibold tracking-tight text-primary tabular-nums">
        {value || <span className="font-normal text-muted-foreground/60">—</span>}
      </dd>
    </div>
  );
}

/** "First Last", or `null` when no one is named, so callers can fall back. */
function person(first: string | null, last: string | null): string | null {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || null;
}

/** The contract window, or `null` when neither end is set. */
function contract(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return `${start ? date(start) : "—"} to ${end ? date(end) : "—"}`;
}

function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function date(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed =
    typeof value === "string"
      ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
      : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

/** The value as text, or null when it is empty or zero. */
function positive(value: string | number | null): string | null {
  const number = Number(value);
  return value !== null && Number.isFinite(number) && number > 0 ? String(number) : null;
}

function area(value: string | null): string | null {
  const number = positive(value);
  return number && `${Number(number).toLocaleString("en-PH")} sqm`;
}

const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());

function money(value: string | null, currency: string) {
  return value
    ? new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency,
        maximumFractionDigits: Number(value) % 1 ? 2 : 0,
      }).format(Number(value))
    : null;
}
