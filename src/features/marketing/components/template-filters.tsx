"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";

type FilterValues = {
  search: string;
  category: string;
  active: string;
};

const EMPTY: FilterValues = { search: "", category: "", active: "" };

export function TemplateFilters({
  type,
  search,
  category,
  active,
  categories,
  preservedQuery = "",
}: {
  type: "email" | "sms";
  search?: string;
  category?: string;
  active?: string;
  categories: string[];
  preservedQuery?: string;
}) {
  const router = useRouter();
  const basePath = `/marketing/${type}-templates`;
  const initial: FilterValues = {
    search: search ?? "",
    category: category ?? "",
    active: active ?? "",
  };
  const [values, setValues] = useState<FilterValues>(initial);
  const [searchText, setSearchText] = useState(initial.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActiveFilters = Boolean(initial.search || initial.category || initial.active);

  const buildQuery = (next: FilterValues) => {
    const params = new URLSearchParams(preservedQuery);
    params.delete("page");
    if (next.search) params.set("search", next.search);
    else params.delete("search");
    if (next.category) params.set("category", next.category);
    else params.delete("category");
    if (next.active) params.set("active", next.active);
    else params.delete("active");
    return params.toString();
  };

  const navigate = (next: FilterValues, replace = false) => {
    const query = buildQuery(next);
    const url = query ? `${basePath}?${query}` : basePath;
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

  const applySelect = (key: "category" | "active", value: string) => {
    const next: FilterValues = { ...values, search: searchText, [key]: value };
    setValues(next);
    navigate(next);
  };

  const clearAll = () => {
    if (searchRef.current) searchRef.current.value = "";
    setSearchText("");
    setValues(EMPTY);
    router.push(preservedQuery ? `${basePath}?${preservedQuery}` : basePath, {
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
        aria-label={`Search ${type} templates`}
        placeholder={`Search ${type} templates`}
      />
      <Select
        name="category"
        aria-label="Category"
        value={values.category}
        onChange={(event) => applySelect("category", event.target.value)}
      >
        <option value="">All categories</option>
        {categories.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>
      <Select
        name="active"
        aria-label="Template status"
        value={values.active}
        onChange={(event) => applySelect("active", event.target.value)}
      >
        <option value="">All templates</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={clearAll}>
          Clear
        </Button>
      )}
    </Toolbar>
  );
}
