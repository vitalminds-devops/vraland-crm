"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";
import {
  campaignChannels,
  campaignStatuses,
  campaignStatusLabel,
  channelLabel,
} from "../lib/marketing-meta";

type FilterValues = {
  search: string;
  status: string;
  channel: string;
};

const EMPTY: FilterValues = { search: "", status: "", channel: "" };
const BASE_PATH = "/marketing/campaigns";

export function CampaignFilters({
  search,
  status,
  channel,
  preservedQuery = "",
}: {
  search?: string;
  status?: string;
  channel?: string;
  preservedQuery?: string;
}) {
  const router = useRouter();
  const initial: FilterValues = {
    search: search ?? "",
    status: status ?? "",
    channel: channel ?? "",
  };
  const [values, setValues] = useState<FilterValues>(initial);
  const [searchText, setSearchText] = useState(initial.search);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasActiveFilters = Boolean(initial.search || initial.status || initial.channel);

  const buildQuery = (next: FilterValues) => {
    const params = new URLSearchParams(preservedQuery);
    params.delete("page");
    if (next.search) params.set("search", next.search);
    else params.delete("search");
    if (next.status) params.set("status", next.status);
    else params.delete("status");
    if (next.channel) params.set("channel", next.channel);
    else params.delete("channel");
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

  const applySelect = (key: "status" | "channel", value: string) => {
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
        aria-label="Search campaigns"
        placeholder="Search campaigns by name"
      />
      <Select
        name="status"
        aria-label="Campaign status"
        value={values.status}
        onChange={(event) => applySelect("status", event.target.value)}
      >
        <option value="">All statuses</option>
        {campaignStatuses.map((value) => (
          <option key={value} value={value}>
            {campaignStatusLabel(value)}
          </option>
        ))}
      </Select>
      <Select
        name="channel"
        aria-label="Campaign channel"
        value={values.channel}
        onChange={(event) => applySelect("channel", event.target.value)}
      >
        <option value="">All channels</option>
        {campaignChannels.map((value) => (
          <option key={value} value={value}>
            {channelLabel(value)}
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
