import { Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Button, ButtonLink, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ReportFilters } from "../schemas/report-filter.schema";

type Options = Awaited<ReturnType<typeof import("../queries/report.queries").getReportOptions>>;
const tabs = [
  { href: "/reports/sales", label: "Sales performance" },
  { href: "/reports/forecast", label: "Forecasting" },
  { href: "/reports/agents", label: "Agent leaderboard" },
  { href: "/reports/conversion", label: "Lead conversion" },
];

/** The filters every report understands, in a stable order. */
const filterKeys = ["agent", "source", "development", "propertyType"] as const;

export function ReportShell({
  title,
  description,
  active,
  filters,
  options,
  children,
  extendedFilters = false,
  showSource = true,
}: {
  title: string;
  description: string;
  active: string;
  filters: ReportFilters;
  options: Options;
  children: ReactNode;
  extendedFilters?: boolean;
  showSource?: boolean;
}) {
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  for (const key of filterKeys) {
    const value = filters[key];
    if (value) query.set(key, value);
  }
  const withFilters = (href: string) => `${href}?${query.toString()}`;

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        actions={
          <a
            href={`/api/reports/${active.split("/").pop()}/export?${query.toString()}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            Export
          </a>
        }
      />
      <nav aria-label="Report sections" className="mt-6 overflow-x-auto">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
          {tabs.map((tab) => {
            const current = tab.href === active;
            return (
              <Link
                key={tab.href}
                href={withFilters(tab.href)}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none ${
                  current
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <form
        method="get"
        className="mt-5 grid gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <Field label="From">
          <DatePicker name="from" defaultValue={filters.from} className={control} />
        </Field>
        <Field label="To">
          <DatePicker name="to" defaultValue={filters.to} className={control} />
        </Field>
        <Field label="Agent">
          <NativeSelect
            name="agent"
            defaultValue={filters.agent ?? ""}
            className={`${control} pr-9`}
          >
            <NativeSelectOption value="">All agents</NativeSelectOption>
            {options.agents.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {extendedFilters && (
          <>
            <Field label="Lead source">
              <NativeSelect
                name="source"
                defaultValue={filters.source ?? ""}
                className={`${control} pr-9`}
              >
                <NativeSelectOption value="">All sources</NativeSelectOption>
                {options.sources.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Development">
              <NativeSelect
                name="development"
                defaultValue={filters.development ?? ""}
                className={`${control} pr-9`}
              >
                <NativeSelectOption value="">All developments</NativeSelectOption>
                {options.developments.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Property type">
              <NativeSelect
                name="propertyType"
                defaultValue={filters.propertyType ?? ""}
                className={`${control} pr-9`}
              >
                <NativeSelectOption value="">All types</NativeSelectOption>
                {options.propertyTypes.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {label(option)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </>
        )}
        {!extendedFilters && showSource && (
          <Field label="Lead source">
            <NativeSelect
              name="source"
              defaultValue={filters.source ?? ""}
              className={`${control} pr-9`}
            >
              <NativeSelectOption value="">All sources</NativeSelectOption>
              {options.sources.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <div className="flex items-end gap-2">
          <Button type="submit" variant="primary" className="h-10">
            Apply
          </Button>
          <ButtonLink href={active} variant="secondary" className="h-10">
            Reset
          </ButtonLink>
        </div>
      </form>
      <div className="mt-6">{children}</div>
    </PageContainer>
  );
}

function Field({ label: title, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{title}</span>
      {children}
    </label>
  );
}
const control =
  "h-10 min-w-0 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground outline-none transition-all hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());

export function MetricCard({
  label: title,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <section className="rounded-xl border border-border/50 bg-card p-5 shadow-xs dark:shadow-none">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {detail && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
    </section>
  );
}
export function ReportEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
