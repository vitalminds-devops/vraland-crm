"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** How many numbers are listed before the chevrons take over. */
const MAX_PAGE_BUTTONS = 8;

function pageList(pageCount: number, page: number): (number | "gap")[] {
  if (pageCount <= MAX_PAGE_BUTTONS) return Array.from({ length: pageCount }, (_, index) => index);
  const middle = Math.min(Math.max(page, 1), pageCount - 2);
  const shown = [...new Set([0, middle - 1, middle, middle + 1, pageCount - 1])]
    .filter((entry) => entry >= 0 && entry < pageCount)
    .sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  shown.forEach((entry, index) => {
    if (index > 0 && entry - shown[index - 1] > 1) out.push("gap");
    out.push(entry);
  });
  return out;
}

export function Paginator({
  page,
  pageCount,
  onPageChange,
  total,
  perPage,
  /** What is being paged, for the buttons' labels: "units", "people". */
  noun,
  disabled = false,
}: {
  /** The page on screen, counted from zero. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Items in the whole list, not on the page. */
  total: number;
  perPage: number;
  noun: string;
  disabled?: boolean;
}) {
  if (pageCount <= 1) return null;

  const first = page * perPage;
  const last = Math.min(first + perPage, total);

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border/40 px-3 py-2">
      <span aria-live="polite" className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
        {first + 1}–{last} of {total}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {pageList(pageCount, page).map((entry, index) =>
          entry === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="shrink-0 px-0.5 text-[12px] text-muted-foreground"
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-label={`Page ${entry + 1} of ${pageCount} ${noun}`}
              aria-current={entry === page ? "page" : undefined}
              disabled={disabled}
              onClick={() => {
                if (entry !== page) onPageChange(entry);
              }}
              className={cn(
                "h-7 min-w-7 flex-1 rounded-md border text-[12px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                entry === page
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {entry + 1}
            </button>
          ),
        )}
        {pageCount > MAX_PAGE_BUTTONS && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Previous page of ${noun}`}
              disabled={disabled || page === 0}
              onClick={() => onPageChange(page - 1)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Next page of ${noun}`}
              disabled={disabled || page === pageCount - 1}
              onClick={() => onPageChange(page + 1)}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
