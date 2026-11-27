"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/** The search icon in a pipeline column's header; it opens a box that filters the column's cards. */
export function StageSearchToggle({
  open,
  onOpen,
  stageName,
}: {
  open: boolean;
  onOpen: () => void;
  stageName: string;
}) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Search ${stageName}`}
      className="-m-1.5 grid size-7 place-items-center rounded-md text-muted-foreground/80 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
    >
      <Search aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/** The column's search box; Escape or ✕ clears it and closes it. */
export function StageSearchBox({
  value,
  onChange,
  onClose,
  stageName,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  stageName: string;
}) {
  const close = () => {
    onChange("");
    onClose();
  };
  return (
    <div className="relative px-2.5 pt-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-[calc(50%-2px)] text-muted-foreground"
      />
      <Input
        type="search"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        aria-label={`Search ${stageName}`}
        placeholder="Name, unit, code…"
        className={cn(
          "h-8 bg-background pr-8 pl-7 text-xs",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      <button
        type="button"
        onClick={close}
        aria-label="Clear search"
        className="absolute top-1/2 right-3.5 grid size-6 -translate-y-[calc(50%-2px)] place-items-center rounded text-muted-foreground hover:text-foreground"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
