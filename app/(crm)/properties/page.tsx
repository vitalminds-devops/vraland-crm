import {
  Archive,
  Building2,
  ChevronRight,
  Download,
  KeyRound,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DotBadge, type DotBadgeTone } from "@/components/ui/dot-badge";
import { label, propertyStatuses, propertyTypes, fieldClass } from "@/features/properties";
import { propertyPageActions } from "@/features/properties/lib/property-page-actions";
import { writablePropertyIds } from "@/features/properties/lib/property-scope";
import { listProperties } from "@/features/properties/queries/property.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { accessPageMode } from "@/features/properties/lib/access-page-mode";
import { cn } from "@/lib/utils/cn";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePagePermission("properties.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const type = typeof params.type === "string" ? params.type : undefined;
  const data = await listProperties({ page, search, status, type });
  // The list shows granted properties; writes also need the data scope.
  const writable = await writablePropertyIds(
    context,
    data.rows.map((row) => row.id),
  );
  // Same rule as the Access page: granters edit it, "See everyone's property access" views it.
  const canOpenAccess = accessPageMode(context) !== null;
  // The header's Actions column lines up with the row buttons.
  const actionsWidth = canOpenAccess ? "sm:w-72" : "sm:w-32";

  const query = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      search,
      status,
      type,
      page: next,
    }))
      if (value !== undefined && value !== "") params.set(key, String(value));
    return `?${params}`;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Properties"
        description="Properties, floors and units."
        actions={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex items-center divide-x divide-border/60">
              <HeaderStat label="properties" value={data.summary.properties} />
              <HeaderStat label="units available" value={data.summary.unitsAvailable} />
              <HeaderStat label="without units yet" value={data.summary.needUnits} />
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/properties/export${query(1).replace(/[?&]page=1$/, "")}`}
                className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}
              >
                <Download aria-hidden="true" className="size-4" />
                Export
              </a>
              {context.permissions.has("properties.delete") && (
                <ButtonLink href="/properties/archive" variant="secondary" className="gap-2">
                  <Archive aria-hidden="true" className="size-4" />
                  Archive
                </ButtonLink>
              )}
              {context.permissions.has("properties.create") && (
                <ButtonLink href="/properties/new" variant="primary" className="gap-2">
                  <Plus aria-hidden="true" className="size-4" />
                  Add property
                </ButtonLink>
              )}
            </div>
          </div>
        }
      />

      <Card className="mt-6">
        <FilterForm className="flex flex-col gap-2 border-b border-border/40 p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 lg:flex-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={search}
              placeholder="Search by name, code or location"
              className={cn(fieldClass, "pl-9")}
            />
          </label>
          <NativeSelect
            name="status"
            aria-label="Status"
            defaultValue={status ?? ""}
            className={cn(fieldClass, "pr-9")}
            wrapperClassName="lg:w-44 lg:shrink-0"
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {propertyStatuses.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {label(v)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            name="type"
            aria-label="Property type"
            defaultValue={type ?? ""}
            className={cn(fieldClass, "pr-9")}
            wrapperClassName="lg:w-44 lg:shrink-0"
          >
            <NativeSelectOption value="">All types</NativeSelectOption>
            {propertyTypes.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {label(v)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FilterForm>

        {!data.rows.length ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <Building2 aria-hidden="true" className="size-8 text-muted-foreground/40" />
            <h2 className="mt-3 text-sm font-medium">No properties found.</h2>
          </div>
        ) : (
          <div>
            <div
              aria-hidden="true"
              className="hidden items-center gap-x-5 border-b border-border/40 bg-muted/30 px-5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:flex"
            >
              <span className="flex-1">Property</span>
              <span className="w-28 text-right">Units available</span>
              <span className={cn("text-right", actionsWidth)}>Actions</span>
            </div>
            <ul className="divide-y divide-border/40">
              {data.rows.map((row) => {
                const location = [row.city, row.province].filter(Boolean).join(", ");
                const rowActions = propertyPageActions(context, writable.has(row.id));
                return (
                  <li
                    key={row.id}
                    className="group relative flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-primary/[0.04] sm:px-5"
                  >
                    {/* The whole row opens the property; the button sits above it. */}
                    <Link
                      href={`/properties/${row.id}`}
                      aria-label={`Open ${row.title}`}
                      className="absolute inset-0 z-0"
                    />
                    <div className="min-w-0 flex-1 basis-56">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h2 className="truncate text-[15px] font-semibold tracking-tight underline-offset-2 group-hover:text-primary group-hover:underline">
                          {row.title}
                        </h2>
                        <DotBadge tone={statusBadgeTone(row.status)}>{label(row.status)}</DotBadge>
                      </div>
                      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                        {row.developmentName && (
                          <>
                            <span className="whitespace-nowrap">
                              Development{" "}
                              <span className="text-foreground/80">{row.developmentName}</span>
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="whitespace-nowrap">
                          Type <span className="text-foreground/80">{label(row.type)}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="whitespace-nowrap">
                          Code{" "}
                          <span className="font-mono text-[11px] text-foreground/80">
                            {row.code}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        {location ? (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin aria-hidden="true" className="size-3 shrink-0" />
                            <span className="truncate">{location}</span>
                          </span>
                        ) : rowActions.canEdit ? (
                          <Link
                            href={`/properties/${row.id}/edit`}
                            className="relative z-10 font-medium text-amber-600 hover:underline dark:text-amber-400"
                          >
                            Add location
                          </Link>
                        ) : (
                          <span>No location set</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 sm:w-28 sm:text-right">
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase sm:hidden">
                        Units available
                      </p>
                      {row.granted.visible ? (
                        <>
                          <p className="text-lg leading-none font-semibold tabular-nums">
                            {row.granted.available}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            of {row.granted.visible}
                            {row.granted.floors ? ` · ${floorLabel(row.granted.floors)}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No units yet</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "relative z-10 ml-auto flex items-center justify-end gap-2 sm:ml-0",
                        actionsWidth,
                      )}
                    >
                      {canOpenAccess && (
                        <ButtonLink
                          href={`/properties/${row.id}/access`}
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          aria-label={`Who can see ${row.title}`}
                        >
                          <KeyRound aria-hidden="true" className="size-3.5" />
                          Who can see this
                        </ButtonLink>
                      )}
                      {row.granted.visible || rowActions.canManageUnits ? (
                        <RowAction href={`/properties/${row.id}`}>View property</RowAction>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 p-4 text-sm">
          <span className="text-muted-foreground">
            {data.total} {data.total === 1 ? "property" : "properties"}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-muted-foreground tabular-nums">
              Page {data.page} of {data.pages}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <ButtonLink variant="secondary" href={query(page - 1)}>
                  Previous
                </ButtonLink>
              )}
              {page < data.pages && (
                <ButtonLink variant="secondary" href={query(page + 1)}>
                  Next
                </ButtonLink>
              )}
            </span>
          </span>
        </footer>
      </Card>
    </PageContainer>
  );
}

/** The row's next step as a button. */
function RowAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ButtonLink href={href} variant="primary" size="sm" className="gap-1">
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" />
    </ButtonLink>
  );
}

/** One figure in the header: the number, and what it counts. */
function HeaderStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 text-left first:pl-0 last:pr-0">
      <p className="text-xl leading-none font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] whitespace-nowrap text-muted-foreground">{label}</p>
    </div>
  );
}

function statusBadgeTone(status: string): DotBadgeTone {
  if (status === "active") return "green";
  if (status === "reserved" || status === "pending" || status === "under_contract") return "amber";
  if (status === "sold" || status === "rented") return "blue";
  return "gray";
}

/** "3 floors" / "1 floor". */
function floorLabel(count: number): string {
  return `${count} ${count === 1 ? "floor" : "floors"}`;
}
