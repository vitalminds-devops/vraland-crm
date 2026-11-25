import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export const TABLE_PAGE_SIZES = [10, 25, 50, 100];

function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const list: (number | "gap")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) list.push("gap");
  for (let p = start; p <= end; p++) list.push(p);
  if (end < total - 1) list.push("gap");
  list.push(total);
  return list;
}

const edgeButtonClass =
  "inline-flex size-10 items-center sm:size-8 justify-center rounded-lg border border-border/60 text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40";

type TablePaginationProps = {
  page: number;
  pages: number;
  pageSize: number;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

/**
 * Rows-per-page select plus first/prev/numbered/next/last pagination. Phones get one line,
 * "Page 2 of 5" with previous/next, and nothing at all when there is a single page.
 */
export function TablePagination({
  page,
  pages,
  pageSize,
  pageSizes = TABLE_PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-sm ${pages <= 1 ? "max-sm:hidden" : ""}`}
    >
      <p className="text-muted-foreground tabular-nums sm:hidden">
        Page {page} of {pages}
      </p>
      <div className="flex items-center gap-3 max-sm:hidden">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Rows</span>
          <NativeSelect
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 cursor-pointer rounded-lg border border-border/60 bg-card pl-2 text-base text-foreground sm:text-sm outline-none transition-colors hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25"
            aria-label="Rows per page"
          >
            {pageSizes.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
      <nav
        className="flex items-center gap-1 max-sm:[&>[data-edge]]:hidden"
        aria-label="Pagination"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className={edgeButtonClass}
          aria-label="First page"
          data-edge
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={edgeButtonClass}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageWindow(page, pages).map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              className="px-1 text-muted-foreground max-sm:hidden"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === page ? "page" : undefined}
              className={`inline-flex h-8 min-w-8 items-center max-sm:hidden justify-center rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
                item === page
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border/60 text-foreground hover:bg-muted/60"
              }`}
            >
              {item}
            </button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pages}
          className={edgeButtonClass}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onPageChange(pages)}
          disabled={page === pages}
          className={edgeButtonClass}
          aria-label="Last page"
          data-edge
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
