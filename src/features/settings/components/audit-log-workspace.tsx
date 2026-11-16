"use client";

import { ChevronDown, FilterX, ScrollText } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardToolbar } from "@/components/ui/card";
import { DotBadge } from "@/components/ui/dot-badge";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { TablePagination } from "@/components/ui/table-pagination";
import { Select, ToolbarSearch } from "@/components/ui/toolbar-helpers";
import { Toolbar } from "@/components/ui/toolbar";
import { tableHeadClass } from "@/components/ui/table-parts";

import { auditActionCopy, auditEntityLabel } from "../lib/audit-labels";

/** One row, already flattened and formatted on the server. */
export type AuditRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string;
  actorEmail: string | null;
  occurredAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** Human name taken from the logged values (code, name, title...). */
  recordName: string | null;
  /** Comma-separated field labels, or "—" when there are none. */
  changedFields: string;
  /** null = the field wasn't logged on that side. */
  changes: { field: string; before: string | null; after: string | null }[];
};

export type AuditFilterState = {
  search: string;
  action: string;
  entityType: string;
  actorUserId: string;
  from: string;
  to: string;
};

export type AuditLogWorkspaceProps = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filters: AuditFilterState;
  actions: string[];
  entityTypes: string[];
  actors: { id: string; name: string; email: string }[];
  pageSizes: readonly number[];
};

export function AuditLogWorkspace({
  rows,
  total,
  page,
  pageSize,
  pageCount,
  filters,
  actions,
  entityTypes,
  actors,
  pageSizes,
}: AuditLogWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search);
  const [openId, setOpenId] = useState<number | null>(null);

  const apply = useCallback(
    (patch: Record<string, string>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (resetPage) next.delete("page");
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  const firstSearch = useRef(true);
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    if (search === filters.search) return;
    const timer = window.setTimeout(() => apply({ search }), 350);
    return () => window.clearTimeout(timer);
  }, [search, filters.search, apply]);

  const [syncedSearch, setSyncedSearch] = useState(filters.search);
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search);
    setSearch(filters.search);
  }

  const dirty =
    filters.search !== "" ||
    filters.action !== "" ||
    filters.entityType !== "" ||
    filters.actorUserId !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  const clear = () => {
    setSearch("");
    apply(
      {
        search: "",
        action: "",
        entityType: "",
        actor: "",
        from: "",
        to: "",
      },
      true,
    );
  };

  return (
    <Card>
      <CardToolbar>
        <Toolbar>
          <ToolbarSearch
            name="search"
            value={search}
            onValueChange={setSearch}
            aria-label="Search the activity log"
            placeholder="Search logs"
          />
          <Select
            name="action"
            aria-label="Filter by action"
            value={filters.action}
            onChange={(event) => apply({ action: event.target.value })}
          >
            <option value="">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {auditActionCopy(action).label}
              </option>
            ))}
          </Select>
          <Select
            name="entity"
            aria-label="Filter by record type"
            value={filters.entityType}
            onChange={(event) => apply({ entity: event.target.value })}
          >
            <option value="">All record types</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {auditEntityLabel(entityType)}
              </option>
            ))}
          </Select>
          <Select
            name="actor"
            aria-label="Filter by person"
            value={filters.actorUserId}
            onChange={(event) => apply({ actor: event.target.value })}
          >
            <option value="">Anyone</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            From
            <DatePicker
              name="from"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => apply({ from: event.target.value })}
              className="h-9 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground outline-none transition-all hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            To
            <DatePicker
              name="to"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => apply({ to: event.target.value })}
              className="h-9 rounded-lg border border-border/60 bg-background px-2 text-sm text-foreground outline-none transition-all hover:border-border focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </label>
          {dirty && (
            <Button type="button" variant="ghost" onClick={clear}>
              <FilterX className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          )}
          <span className="sr-only" aria-live="polite">
            {isPending ? "Loading activity" : `Showing ${rows.length} of ${total} entries`}
          </span>
        </Toolbar>
      </CardToolbar>

      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title={dirty ? "No matches" : "No activity yet"} />
        ) : (
          <div className={`overflow-x-auto ${isPending ? "opacity-60" : ""}`}>
            <Table className="w-full text-left text-sm">
              <TableHeader className={tableHeadClass}>
                <TableRow>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    When
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    Person
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    Action
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    Record
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    Changed
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Details</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const action = auditActionCopy(row.action);
                  const open = openId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={`border-b border-border/40 last:border-0 hover:bg-muted/30 ${open ? "bg-muted/30" : ""}`}
                      >
                        <TableCell className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {row.occurredAt}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground"
                          title={row.actorEmail ?? undefined}
                        >
                          {row.actorName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-4 py-3">
                          <DotBadge tone={action.tone}>{action.label}</DotBadge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-foreground">
                          {auditEntityLabel(row.entityType)}
                          {(row.recordName || row.entityId) && (
                            <span className="text-muted-foreground">
                              {" · "}
                              {row.recordName ?? row.entityId?.slice(0, 8)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[22rem] px-4 py-3 text-xs text-muted-foreground">
                          {row.changedFields}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          {row.changes.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setOpenId(open ? null : row.id)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                            >
                              {open ? "Hide" : "View"}
                              <ChevronDown
                                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="border-b border-border/40 bg-muted/20">
                          <TableCell colSpan={6} className="px-4 py-3">
                            <table className="w-full max-w-2xl text-xs">
                              <thead className="text-muted-foreground">
                                <tr>
                                  <th scope="col" className="py-1 pr-4 text-left font-medium">
                                    Field
                                  </th>
                                  <th scope="col" className="py-1 pr-4 text-left font-medium">
                                    Before
                                  </th>
                                  <th scope="col" className="py-1 text-left font-medium">
                                    After
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.changes.map((change) => (
                                  <tr key={change.field} className="border-t border-border/40">
                                    <td className="py-1.5 pr-4 font-medium text-foreground">
                                      {change.field}
                                    </td>
                                    <td className="break-words py-1.5 pr-4 text-muted-foreground line-through decoration-muted-foreground/40">
                                      {change.before ?? ""}
                                    </td>
                                    <td className="break-words py-1.5 text-foreground">
                                      {change.after ?? ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(row.ipAddress || row.actorEmail) && (
                              <p className="mt-2 text-[11px] text-muted-foreground">
                                {[row.actorEmail, row.ipAddress && `IP ${row.ipAddress}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {rows.length > 0 && (
        <TablePagination
          page={page}
          pages={pageCount}
          pageSize={pageSize}
          pageSizes={[...pageSizes]}
          onPageChange={(next) => apply({ page: String(next) }, false)}
          onPageSizeChange={(size) => apply({ pageSize: String(size), page: "" })}
        />
      )}
    </Card>
  );
}
