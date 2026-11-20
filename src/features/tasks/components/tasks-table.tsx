"use client";

import { differenceInCalendarDays, format } from "date-fns";
import {
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  ListChecks,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { SortChevron, sortHeaderClass, tableHeadClass } from "@/components/ui/table-parts";
import { formatContactName } from "@/features/contacts";
import { cn } from "@/lib/utils/cn";

import { TaskBadge } from "./task-badge";
import { TaskForm } from "./task-form";
import { TaskStatus } from "./task-status";
import {
  TASK_PRIORITY_TONES,
  TASK_STATUS_TONES,
  TASK_TYPE_ICONS,
  taskTypeLabel,
  titleCase,
  type TaskTone,
} from "../lib/task-options";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  taskType: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  reminderAt: Date | null;
  assignedUserId: string | null;
  assignedFirstName: string | null;
  assignedLastName: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactMiddleName: string | null;
  contactLastName: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  dealId: string | null;
  dealTitle: string | null;
};

/** The columns the table can be ordered by; the query owns the mapping. */
type SortKey = "task" | "due" | "priority" | "assignee" | "status";

const SORTABLE: readonly SortKey[] = ["task", "due", "priority", "assignee", "status"];

/** Statuses that no longer need action; they recede in the table. */
const CLOSED = ["completed", "cancelled"];

function dueMeta(dueAt: Date | null, closed: boolean) {
  if (!dueAt) return { label: "No due date", tone: "text-muted-foreground", overdue: false };
  const days = differenceInCalendarDays(dueAt, new Date());
  if (closed)
    return {
      label: format(dueAt, "MMM d, yyyy"),
      tone: "text-muted-foreground",
      overdue: false,
    };
  if (days < 0)
    return {
      label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`,
      tone: "text-destructive",
      overdue: true,
    };
  if (days === 0)
    return {
      label: "Due today",
      tone: "text-brand-3",
      overdue: false,
    };
  if (days === 1) return { label: "Due tomorrow", tone: "text-foreground", overdue: false };
  return { label: `Due in ${days} days`, tone: "text-foreground", overdue: false };
}

/** A linked record, as a muted inline link rather than a second bordered chip. */
function RecordLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-primary"
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-border">
      ·
    </span>
  );
}

export function TasksTable({
  rows,
  page,
  pages,
  pageSize,
  sort,
  dir,
  canUpdate,
  canDelete = false,
  options,
  hasActiveFilters = false,
  emptyAction,
}: {
  rows: TaskRow[];
  page: number;
  pages: number;
  pageSize: number;
  sort?: string;
  dir?: string;
  canUpdate: boolean;
  canDelete?: boolean;
  /** Record choices for the edit dialog; rows get an edit button only when given. */
  options?: ComponentProps<typeof TaskForm>["options"];
  /** Swaps the empty state's copy for the "nothing matched" case. */
  hasActiveFilters?: boolean;
  /** The way out of an empty list: create the first task, or clear the filters. */
  emptyAction?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const editable = canUpdate && options !== undefined;
  const activeSort = SORTABLE.includes(sort as SortKey) ? (sort as SortKey) : null;
  const activeDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  const push = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSort = (column: SortKey) =>
    push((params) => {
      params.set("page", "1");
      if (activeSort === column) {
        if (activeDir === "asc") params.set("dir", "desc");
        else {
          params.delete("sort");
          params.delete("dir");
        }
      } else {
        params.set("sort", column);
        params.set("dir", "asc");
      }
    });

  const sortAria = (column: SortKey): "ascending" | "descending" | "none" =>
    activeSort === column ? (activeDir === "asc" ? "ascending" : "descending") : "none";

  const sortableHeader = (column: SortKey, label: string, className: string) => (
    <TableHead scope="col" className={className} aria-sort={sortAria(column)}>
      <button type="button" onClick={() => handleSort(column)} className={sortHeaderClass}>
        {label}
        <SortChevron active={activeSort === column} dir={activeDir} />
      </button>
    </TableHead>
  );

  const goToPage = (next: number) =>
    push((params) => params.set("page", String(Math.min(Math.max(1, next), pages))));

  const changePageSize = (size: number) =>
    push((params) => {
      params.set("pageSize", String(size));
      params.set("page", "1");
    });

  if (!rows.length)
    return (
      <EmptyState
        icon={ListChecks}
        title={hasActiveFilters ? "No tasks match" : "No tasks yet"}
        description={hasActiveFilters ? "Try other filters." : "Follow-ups you add show up here."}
        action={emptyAction}
      />
    );

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="w-full table-fixed text-left text-sm">
          <TableHeader className={tableHeadClass}>
            <TableRow>
              {sortableHeader("task", "Task", "px-4 py-3 sm:w-[34%] sm:px-5")}
              {sortableHeader("due", "Due", "hidden px-4 py-3 sm:table-cell")}
              {sortableHeader("priority", "Priority", "hidden w-28 px-4 py-3 md:table-cell")}
              {sortableHeader("assignee", "Assignee", "hidden px-4 py-3 lg:table-cell")}
              {sortableHeader("status", "Status", "w-32 px-2 py-3 sm:w-36 sm:px-4")}
              {editable && (
                <TableHead scope="col" className="w-12 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/40">
            {rows.map((row) => {
              const closed = CLOSED.includes(row.status);
              const status = TASK_STATUS_TONES[row.status] ?? {
                label: titleCase(row.status),
                tone: "muted" as TaskTone,
              };
              const due = dueMeta(row.dueAt, closed);
              const assignee = row.assignedFirstName
                ? `${row.assignedFirstName} ${row.assignedLastName ?? ""}`.trim()
                : null;
              const TypeIcon = TASK_TYPE_ICONS[row.taskType];
              const hasRecords = row.contactId || row.propertyId || row.dealId;

              return (
                <TableRow
                  key={row.id}
                  className="border-b border-border/40 bg-card transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                >
                  <TableCell className="px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "line-clamp-2 break-words font-semibold",
                            closed ? "text-muted-foreground" : "text-foreground",
                          )}
                          title={row.title}
                        >
                          {row.title}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex shrink-0 items-center gap-1">
                          {TypeIcon && <TypeIcon aria-hidden="true" className="size-3.5" />}
                          {taskTypeLabel(row.taskType)}
                        </span>
                        <Sep />
                        <span className="min-w-0 break-words">
                          Created by:{" "}
                          {[row.creatorFirstName, row.creatorLastName].filter(Boolean).join(" ") ||
                            "Unknown user"}
                        </span>
                        {!hasRecords && row.description && (
                          <>
                            <Sep />
                            <span className="max-w-[36ch] truncate">{row.description}</span>
                          </>
                        )}
                        {row.contactId && (
                          <>
                            <Sep />
                            <RecordLink href={`/contacts/${row.contactId}`} icon={User}>
                              {formatContactName({
                                firstName: row.contactFirstName,
                                middleName: row.contactMiddleName,
                                lastName: row.contactLastName,
                              })}
                            </RecordLink>
                          </>
                        )}
                        {row.propertyId && (
                          <>
                            <Sep />
                            <RecordLink
                              href={`/properties/buildings/${row.propertyId}`}
                              icon={Building2}
                            >
                              {row.propertyTitle}
                            </RecordLink>
                          </>
                        )}
                        {row.dealId && (
                          <>
                            <Sep />
                            <RecordLink href={`/deals/${row.dealId}`} icon={Briefcase}>
                              {row.dealTitle}
                            </RecordLink>
                          </>
                        )}
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs lg:hidden">
                        <span
                          className={cn("inline-flex items-center gap-1.5 sm:hidden", due.tone)}
                        >
                          <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
                          {due.label}
                        </span>
                        <TaskBadge
                          className="md:hidden"
                          tone={TASK_PRIORITY_TONES[row.priority] ?? "muted"}
                        >
                          {titleCase(row.priority)}
                        </TaskBadge>
                        <span className="min-w-0 break-words text-muted-foreground">
                          Assignee: {assignee ?? "Unassigned"}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden px-4 py-4 sm:table-cell">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        due.tone,
                      )}
                    >
                      <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
                      {due.label}
                    </span>
                    {row.dueAt && !closed && (
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        {format(row.dueAt, "MMM d, yyyy")}
                      </span>
                    )}
                    {row.reminderAt && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Bell aria-hidden="true" className="size-3 shrink-0" />
                        {format(row.reminderAt, "MMM d, h:mm a")}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="hidden px-4 py-4 md:table-cell">
                    <TaskBadge tone={TASK_PRIORITY_TONES[row.priority] ?? "muted"}>
                      {titleCase(row.priority)}
                    </TaskBadge>
                  </TableCell>

                  <TableCell className="hidden px-4 py-4 lg:table-cell">
                    {assignee ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <InitialsAvatar
                          className="size-7 text-[10px]"
                          initials={`${row.assignedFirstName?.[0] ?? ""}${row.assignedLastName?.[0] ?? ""}`.toUpperCase()}
                        />
                        <span className="truncate text-xs text-foreground" title={assignee}>
                          {assignee}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell className="px-2 py-4 sm:px-4">
                    {canUpdate ? (
                      <TaskStatus id={row.id} status={row.status} />
                    ) : (
                      <TaskBadge tone={status.tone}>{status.label}</TaskBadge>
                    )}
                  </TableCell>

                  {editable && (
                    <TableCell className="w-12 px-1 py-4 sm:px-2">
                      <TaskForm task={row} options={options} canDelete={canDelete} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        page={page}
        pages={pages}
        pageSize={pageSize}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
      />
    </>
  );
}
