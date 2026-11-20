import { Plus, Search } from "lucide-react";
import { FilterForm } from "@/components/common/filter-form";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DevelopmentGrid, label } from "@/features/developments";
import { loadDevelopmentsPageData } from "@/features/developments/lib/page-loaders";

export default async function DevelopmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, data, query, page, search, status, developmentStatuses } =
    await loadDevelopmentsPageData(searchParams);

  return (
    <PageContainer>
      <PageHeader
        title="Developments"
        description="Projects and their properties."
        actions={
          context.permissions.has("developments.create") ? (
            <ButtonLink href="/developments/new" variant="primary" className="gap-2">
              <Plus aria-hidden="true" className="size-4" />
              Add development
            </ButtonLink>
          ) : undefined
        }
      />

      <Card>
        <FilterForm className="flex flex-col gap-2 border-b border-border/40 p-4 md:flex-row md:items-center">
          <label className="relative min-w-0 md:flex-1">
            <span className="sr-only">Search developments by code, name, or location</span>
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              name="search"
              defaultValue={search}
              placeholder="Search code, name, or location"
              className="pl-9"
            />
          </label>
          <NativeSelect
            name="status"
            aria-label="Status"
            defaultValue={status ?? ""}
            wrapperClassName="md:w-48 md:shrink-0"
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {developmentStatuses.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {label(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {(search || status) && (
            <ButtonLink href="/developments" variant="ghost">
              Clear filters
            </ButtonLink>
          )}
        </FilterForm>

        <DevelopmentGrid
          rows={data.rows}
          canUpdate={context.permissions.has("developments.update")}
          hasFilters={Boolean(search || status)}
        />

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 p-4 text-sm">
          <span className="text-muted-foreground">
            {data.total} {data.total === 1 ? "development" : "developments"}
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
