"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";
import { sequenceTriggers, triggerLabel } from "../lib/marketing-meta";

type FilterValues = {
  search: string;
  active: string;
  trigger: string;
};

const EMPTY: FilterValues = { search: "", active: "", trigger: "" };
const BASE_PATH = "/marketing/automations";

export function SequenceFilters({
  search,
  active,
  trigger,
  preservedQuery = "",
}: {
  search?: string;
  active?: string;
  trigger?: string;
  preservedQuery?: string;
}) {
  const router = useRouter();
  const initial: FilterValues = {
    search: search ?? "",
    active: active ?? "",
    trigger: trigger ?? "",
  };
  const [values, setValues] = useState<FilterValues>(initial);
  const [searchText, setSearchText] = useState(initial.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActiveFilters = Boolean(initial.search || initial.active || initial.trigger);

  const buildQuery = (next: FilterValues) => {
    const params = new URLSearchParams(preservedQuery);
    params.delete("page");
    if (next.search) params.set("search", next.search);
    else params.delete("search");
    if (next.active) params.set("active", next.active);
    else params.delete("active");
    if (next.trigger) params.set("trigger", next.trigger);
    else params.delete("trigger");
    return params.toString();
  };

  const navigate = (next: FilterValues, replace = false) => {
    const query = buildQuery(next);
    const url = query ? `${BASE_PATH}?${query}` : BASE_PATH;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

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

  const applySelect = (key: "active" | "trigger", value: string) => {
    const next: FilterValues = { ...values, search: searchText, [key]: value };
    setValues(next);
    navigate(next);
  };

  const clearAll = () => {
    if (searchRef.current) searchRef.current.value = "";
    setSearchText("");
    setValues(EMPTY);
    router.push(preservedQuery ? `${BASE_PATH}?${preservedQuery}` : BASE_PATH, {
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
        aria-label="Search follow-ups"
        placeholder="Search follow-ups"
      />
      <Select
        name="active"
        aria-label="Status"
        value={values.active}
        onChange={(event) => applySelect("active", event.target.value)}
      >
        <option value="">All follow-ups</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      <Select
        name="trigger"
        aria-label="Starts when"
        value={values.trigger}
        onChange={(event) => applySelect("trigger", event.target.value)}
      >
        <option value="">All triggers</option>
        {sequenceTriggers.map((value) => (
          <option key={value} value={value}>
            {triggerLabel(value)}
          </option>
        ))}
      </Select>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={clearAll}>
          Clear
        </Button>
      )}
    </Toolbar>
  );
}
