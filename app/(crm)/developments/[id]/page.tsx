import { ImagePlus, Layers, MapPin, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/common/back-button";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Detail, Stat, formatDate, label } from "@/features/developments";
import { DevelopmentBuildingCard } from "@/features/developments/components/development-building-card";
import { DevelopmentDeleteButton } from "@/features/developments/components/development-delete-button";
import { getDevelopment } from "@/features/developments/queries/development.queries";
import { developmentCoverImageUrl } from "@/features/developments/lib/cover-image";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { canGrantUnitAccess } from "@/lib/permissions/policy";

export default async function DevelopmentPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission("developments.view");
  const { id } = await params;
  const data = await getDevelopment(id);
  if (!data) notFound();
  const { record, buildings, unitCount } = data;
  const canEdit = context.permissions.has("developments.update");
  const canAddProperty = context.permissions.has("properties.create");
  const canDelete = context.permissions.has("developments.delete");
  // The form preselects this development and copies its address.
  const addPropertyHref = `/properties/new?developmentId=${id}`;
  const coverUrl = developmentCoverImageUrl(record);

  return (
    <PageContainer>
      <PageHeader
        title={record.name}
        description={
          [record.city, record.province].filter(Boolean).join(", ") || "Location not specified"
        }
        actions={
          <>
            <BackButton fallbackHref="/developments" label="Back to developments" />
            {canEdit ? (
              <ButtonLink href={`/developments/${id}/edit`} variant="secondary" className="gap-2">
                <Pencil aria-hidden="true" className="size-4" />
                Edit development
              </ButtonLink>
            ) : undefined}
            {canDelete ? <DevelopmentDeleteButton id={id} name={record.name} /> : undefined}
            {canAddProperty ? (
              <ButtonLink href={addPropertyHref} className="gap-2">
                <Plus aria-hidden="true" className="size-4" />
                Add property
              </ButtonLink>
            ) : undefined}
          </>
        }
      />

      {coverUrl ? (
        <div className="mt-6 h-56 overflow-hidden rounded-xl border border-border/60 bg-muted/30 sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route, which next/image's optimiser cannot fetch. */}
          <img
            src={coverUrl}
            alt={`${record.name} cover photo`}
            className="h-full w-full object-cover"
          />
        </div>
      ) : canEdit ? (
        <Link
          href={`/developments/${id}/edit`}
          className="mt-6 flex h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ImagePlus aria-hidden="true" className="size-4" />
          Add a cover photo
        </Link>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-[15px] font-semibold">About</h2>
          <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">
            {record.description || "No description yet."}
          </p>
          <dl className="mt-5 grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
            <Detail label="Code" value={record.code} mono />
            <Detail label="Status" value={label(record.status)} />
            <Detail label="Launch" value={formatDate(record.launchDate)} />
            <Detail label="Completion" value={formatDate(record.completionDate)} />
            <Detail label="Address" value={record.addressLine1 ?? "Not specified"} />
            <Detail label="Postal code" value={record.postalCode ?? "Not specified"} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Properties</h2>
          <div className="mt-4 space-y-4">
            <Stat
              icon={<Layers aria-hidden="true" className="size-4" />}
              label="Properties"
              value={buildings.length}
            />
            <Stat
              icon={<MapPin aria-hidden="true" className="size-4" />}
              label="Units"
              value={unitCount}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between gap-3 border-b border-border/40 p-4">
          <h2 className="text-[15px] font-semibold">Properties</h2>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-muted-foreground">
              {buildings.length} {buildings.length === 1 ? "property" : "properties"}
            </span>
            {canAddProperty && buildings.length > 0 ? (
              <ButtonLink href={addPropertyHref} variant="secondary" size="sm" className="gap-1.5">
                <Plus aria-hidden="true" className="size-3.5" />
                Add property
              </ButtonLink>
            ) : null}
          </div>
        </div>
        {buildings.length ? (
          <ul className="space-y-3 p-3">
            {buildings.map((building) => (
              <li key={building.id}>
                <DevelopmentBuildingCard
                  building={building}
                  canEdit={context.permissions.has("properties.update")}
                  canAccess={canGrantUnitAccess(context)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid place-items-center px-6 py-12 text-center">
            <h3 className="text-sm font-medium">No properties yet.</h3>
            {canAddProperty ? (
              <ButtonLink href={addPropertyHref} className="mt-4 gap-2">
                <Plus aria-hidden="true" className="size-4" />
                Add property
              </ButtonLink>
            ) : null}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
