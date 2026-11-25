"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";
import { employmentTypes } from "../lib/contact-options";

type ContactFiltersProps = {
  search?: string;
  lifecycle?: string;
  employment?: string;
  broker?: string;
  brokers?: { id: string; firstName: string; lastName: string }[];
  viewMode?: "table" | "grouped";
  onViewModeChange?: (mode: "table" | "grouped") => void;
  preservedQuery?: string;
};

type FilterValues = {
  search: string;
  lifecycle: string;
  employment: string;
  broker: string;
};

const EMPTY: FilterValues = {
  search: "",
  lifecycle: "",
  employment: "",
  broker: "",
};

export function ContactFilters({
  search,
  lifecycle,
  employment,
  broker,
  brokers = [],
  viewMode = "table",
  onViewModeChange,
  preservedQuery = "",
}: ContactFiltersProps) {
  const router = useRouter();
  const initial: FilterValues = {
    search: search ?? "",
    lifecycle: lifecycle ?? "",
    employment: employment ?? "",
    broker: broker ?? "",
  };
  const [values, setValues] = useState<FilterValues>(initial);
  const [searchText, setSearchText] = useState(initial.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveFilters = Boolean(
    initial.search || initial.lifecycle || initial.employment || initial.broker,
  );

  const buildQuery = (next: FilterValues) => {
    const params = new URLSearchParams(preservedQuery);
    // Any filter change resets to the first page.
    params.delete("page");
    if (next.search) params.set("search", next.search);
    if (next.lifecycle) params.set("lifecycle", next.lifecycle);
    if (next.employment) params.set("employment", next.employment);
    if (next.broker) params.set("broker", next.broker);
    return params.toString();
  };

  const navigate = (next: FilterValues, replace = false) => {
    const query = buildQuery(next);
    const url = query ? `/contacts?${query}` : "/contacts";
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  // Realtime, debounced search: navigate once typing pauses.
  useEffect(() => {
    if (searchText === values.search) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = { ...values, search: searchText };
      setValues(next);
      navigate(next, true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const applySelect = (key: "lifecycle" | "employment" | "broker", value: string) => {
    const next: FilterValues = { ...values, search: searchText, [key]: value };
    setValues(next);
    navigate(next);
  };

  const clearAll = () => {
    if (searchRef.current) searchRef.current.value = "";
    setSearchText("");
    setValues(EMPTY);
    router.push(preservedQuery ? `/contacts?${preservedQuery}` : "/contacts", {
      scroll: false,
    });
  };

  const filterCount = [initial.lifecycle, initial.employment, initial.broker].filter(
    Boolean,
  ).length;

  // Most-acted-on first: owner, then the rarely used employment type.
  const brokerSelect = (
    <Select
      name="broker"
      aria-label="Broker"
      value={values.broker}
      onChange={(e) => applySelect("broker", e.target.value)}
    >
      <option value="">All brokers</option>
      {brokers.map((broker) => (
        <option key={broker.id} value={broker.id}>
          {broker.firstName} {broker.lastName}
        </option>
      ))}
    </Select>
  );
  const employmentSelect = (
    <Select
      name="employment"
      aria-label="Employment type"
      value={values.employment}
      onChange={(e) => applySelect("employment", e.target.value)}
    >
      <option value="">Any employment</option>
      {employmentTypes.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  );
  const viewToggle = onViewModeChange && (
    <div
      role="group"
      aria-label="View"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5"
    >
      {(["table", "grouped"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          onClick={() => onViewModeChange(mode)}
          className={`h-8 flex-1 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors ${
            viewMode === mode
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "table" ? "Table" : "By broker"}
        </button>
      ))}
    </div>
  );

  return (
    <Toolbar>
      {/* Phones: search and a Filters button; the filters open in a bottom sheet. */}
      <div className="flex w-full items-center gap-2 sm:contents max-sm:[&>div:first-child]:min-w-0">
        <ToolbarSearch
          ref={searchRef}
          name="search"
          value={searchText}
          onValueChange={setSearchText}
          aria-label="Search contacts and leads"
          placeholder="Search contacts"
        />
        <Button
          type="button"
          variant="secondary"
          aria-label={filterCount ? `Filters, ${filterCount} on` : "Filters"}
          onClick={() => setFiltersOpen(true)}
          className="relative size-9 shrink-0 p-0 sm:hidden"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {filterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid size-4.5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground tabular-nums">
              {filterCount}
            </span>
          )}
        </Button>
      </div>
      <div className="contents max-sm:hidden">
        {brokerSelect}
        {employmentSelect}
        {hasActiveFilters && (
          <Button type="button" variant="ghost" onClick={clearAll}>
            Clear
          </Button>
        )}
        {viewToggle}
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 flex items-end bg-black/40 sm:hidden">
            <DialogPopup className="w-full rounded-t-2xl border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
              <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
              <DialogTitle className="text-base font-semibold">Filters</DialogTitle>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5 text-sm font-medium">
                  Broker
                  {brokerSelect}
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Employment
                  {employmentSelect}
                </label>
                {viewToggle && (
                  <div className="grid gap-1.5 text-sm font-medium">
                    View
                    {viewToggle}
                  </div>
                )}
              </div>
              <div className="mt-6 flex gap-2">
                {hasActiveFilters && (
                  <Button type="button" variant="secondary" className="flex-1" onClick={clearAll}>
                    Clear
                  </Button>
                )}
                <DialogClose className={buttonVariants({ className: "flex-1" })}>Done</DialogClose>
              </div>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </Toolbar>
  );
}
