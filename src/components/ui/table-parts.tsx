import { ChevronDown, Columns } from "lucide-react";

/** Classes for the `<thead>` shared by every CRM data table. */
export const tableHeadClass =
  "border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground";

/** Classes for a sortable column header button. */
export const sortHeaderClass =
  "group inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";

/** Chevron that is revealed on hover and flips when sorted ascending. */
export function SortChevron({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={
        active
          ? `h-3.5 w-3.5 opacity-100 transition-all ${dir === "asc" ? "rotate-180" : ""}`
          : "h-3.5 w-3.5 opacity-0 transition-all group-hover:opacity-50"
      }
    />
  );
}

/** "Columns" toggle shown at the far right of the table header. */
export function ColumnsToggleButton({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label="Toggle additional columns"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
        pressed
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <Columns className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">Columns</span>
    </button>
  );
}
