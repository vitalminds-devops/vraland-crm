import type { ReactNode } from "react";
import { TableCell, TableHead, TableHeader } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

export function RecordTable({
  head,
  footer,
  children,
  className,
}: {
  /** The `<tr>` of column headings, rendered inside the `<thead>`. */
  head: ReactNode;
  /** A caption strip under the table — row counts, or a note about hidden rows. */
  footer?: ReactNode;
  /** The `<tbody>`. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/60", className)}>
      <div className="max-h-[380px] overflow-auto">
        <table className="w-full text-left text-sm">
          <TableHeader className="sticky top-0 z-10 border-b border-border/50 bg-muted text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {head}
          </TableHeader>
          {children}
        </table>
      </div>
      {footer ? (
        <p className="border-t border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </div>
  );
}

/** Standard cell padding for a `RecordTable`, aligned with the card's gutter. */
export function RecordTh({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TableHead scope="col" className={cn("px-4 py-2.5 font-medium", className)}>
      {children}
    </TableHead>
  );
}

/** Standard cell padding for a `RecordTable` body cell. */
export function RecordTd({ children, className }: { children: ReactNode; className?: string }) {
  return <TableCell className={cn("px-4 py-3 text-[13px]", className)}>{children}</TableCell>;
}
