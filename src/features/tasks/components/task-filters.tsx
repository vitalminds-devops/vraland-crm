"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabel,
  taskStatusLabel,
} from "../lib/task-options";

type TaskFiltersProps = {
  search?: string;
  status?: string;
  priority?: string;
  /** Set by the summary cards above the table; cleared with everything else. */
  timing?: string;
  preservedQuery?: string;
};

type FilterValues = {
  search: string;
  status: string;
  priority: string;
  timing: string;
};

export function TaskFilters({
  search,
  status,
  priority,
  timing,
  preservedQuery = "",
}: TaskFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const initial: FilterValues = {
    search: search ?? "",
    status: status ?? "",
    priority: priority ?? "",
    timing: timing ?? "",
  };
  const [values, setValues] = useState<FilterValues>(initial);
  const [searchText, setSearchText] = useState(initial.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasActiveFilters = Boolean(
    initial.search || initial.status || initial.priority || initial.timing,
  );

  const buildQuery = (next: FilterValues) => {
    const params = new URLSearchParams(preservedQuery);
    // Any filter change resets to the first page.
    params.delete("page");
    if (next.search) params.set("search", next.search);
    if (next.status) params.set("status", next.status);
    if (next.priority) params.set("priority", next.priority);
    if (next.timing) params.set("timing", next.timing);
    return params.toString();
  };

  const navigate = (next: FilterValues, replace = false) => {
    const query = buildQuery(next);
    const url = query ? `${pathname}?${query}` : pathname;
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

  const applySelect = (key: "status" | "priority", value: string) => {
    const next: FilterValues = { ...values, search: searchText, [key]: value };
    setValues(next);
    navigate(next);
  };

  const clearAll = () => {
    if (searchRef.current) searchRef.current.value = "";
    setSearchText("");
    setValues({ search: "", status: "", priority: "", timing: "" });
    router.push(preservedQuery ? `${pathname}?${preservedQuery}` : pathname, { scroll: false });
  };

  return (
    <Toolbar>
      <ToolbarSearch
        ref={searchRef}
        name="search"
        value={searchText}
        onValueChange={setSearchText}
        aria-label="Search tasks"
        placeholder="Search task or description"
      />
      <Select
        name="status"
        aria-label="Status"
        value={values.status}
        onChange={(event) => applySelect("status", event.target.value)}
      >
        <NativeSelectOption value="">All statuses</NativeSelectOption>
        {TASK_STATUSES.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {taskStatusLabel(value)}
          </NativeSelectOption>
        ))}
      </Select>
      <Select
        name="priority"
        aria-label="Priority"
        value={values.priority}
        onChange={(event) => applySelect("priority", event.target.value)}
      >
        <NativeSelectOption value="">All priorities</NativeSelectOption>
        {TASK_PRIORITIES.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {taskPriorityLabel(value)}
          </NativeSelectOption>
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
