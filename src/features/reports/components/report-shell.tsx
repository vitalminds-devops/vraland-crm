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
];

/** The filters every report understands, in a stable order. */
const filterKeys = ["agent", "development", "propertyType"] as const;

export function ReportShell({
  title,
  description,
  active,
  filters,
  options,
  children,
  extendedFilters = false,
}: {
  title: string;
  description: string;
  active: string;
  filters: ReportFilters;
  options: Options;
  children: ReactNode;
  extendedFilters?: boolean;
}) {
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  for (const key of filterKeys) {
    if (key !== "agent" && !extendedFilters) continue;
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
            Export CSV
          </a>
        }
      />
      <nav aria-label="Report sections" className="mt-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:flex-wrap">
          {tabs.map((tab) => {
            const current = tab.href === active;
            return (
              <Link
                key={tab.href}
                href={withFilters(tab.href)}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:outline-none ${
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
        aria-label="Report filters"
        className={`mt-5 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 ${extendedFilters ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
      >
        <Field label="Start date">
          <DatePicker name="from" defaultValue={filters.from} className={control} />
        </Field>
        <Field label="End date">
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
        <div className="flex items-end gap-2 [&>*]:flex-1">
          <Button type="submit" variant="primary" className="h-10">
            Apply filters
          </Button>
          <ButtonLink href={active} variant="secondary" className="h-10">
            Reset
          </ButtonLink>
        </div>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Reporting period:{" "}
        <span className="font-medium text-foreground">
          {dateLabel(filters.from)} – {dateLabel(filters.to)}
        </span>
        . Dates use Manila time.
      </p>
      <div className="mt-5">{children}</div>
    </PageContainer>
  );
}

function Field({ label: title, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{title}</span>
      {children}
    </label>
  );
}
const control =
  "h-10 min-w-0 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground outline-none transition-all hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

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
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl leading-tight font-semibold tracking-tight break-words tabular-nums text-foreground">
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
