"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  return (
    <Toolbar>
      <ToolbarSearch
        ref={searchRef}
        name="search"
        value={searchText}
        onValueChange={setSearchText}
        aria-label="Search contacts and leads"
        placeholder="Search name, email, mobile or code"
      />
      {/* Most-acted-on first: stage, then owner, and the rarely used employment type. */}
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
      <Select
        name="employment"
        aria-label="Employment type"
        className="sm:w-44"
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
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={clearAll}>
          Clear
        </Button>
      )}
      {onViewModeChange && (
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
              className={`h-8 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "table" ? "Table" : "By broker"}
            </button>
          ))}
        </div>
      )}
    </Toolbar>
  );
}
