"use client";

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
import { manilaDateTime, manilaDaysBetween } from "@/lib/utils/manila-time";
import { formatDate } from "@/features/contacts/lib/helpers";

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
  const days = manilaDaysBetween(dueAt);
  if (closed)
    return {
      label: formatDate(dueAt),
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
      className="inline-flex min-w-0 items-center gap-1 rounded-sm transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
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
        <Table aria-label="Tasks" className="w-full table-fixed text-left text-sm">
          <TableHeader className={tableHeadClass}>
            <TableRow>
              {sortableHeader("task", "Task", "px-4 py-3")}
              <TableHead scope="col" className="hidden px-4 py-3 xl:table-cell">
                Type
              </TableHead>
              {sortableHeader("due", "Due", "hidden px-4 py-3 sm:table-cell")}
              {sortableHeader("priority", "Priority", "hidden px-4 py-3 md:table-cell")}
              {sortableHeader("assignee", "Assignee", "hidden px-4 py-3 lg:table-cell")}
              <TableHead scope="col" className="hidden px-4 py-3 xl:table-cell">
                Created by
              </TableHead>
              {sortableHeader(
                "status",
                "Status",
                "py-3 pl-2 pr-0 text-right sm:pl-4 [&>button]:w-32 [&>button]:max-w-full",
              )}
              {editable && (
                <TableHead scope="col" className="w-16 px-3 py-3 text-center">
                  Actions
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
              const creator =
                [row.creatorFirstName, row.creatorLastName].filter(Boolean).join(" ") ||
                "Unknown user";
              const hasRecords = row.contactId || row.propertyId || row.dealId;

              return (
                <TableRow
                  key={row.id}
                  className="border-b border-border/40 bg-card transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                >
                  <TableCell className="px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "line-clamp-2 [overflow-wrap:anywhere] font-semibold",
                            closed ? "text-muted-foreground" : "text-foreground",
                          )}
                          title={row.title}
                        >
                          {row.title}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground",
                          !hasRecords && !row.description && "xl:hidden",
                        )}
                      >
                        <span className="inline-flex shrink-0 items-center gap-1 xl:hidden">
                          {TypeIcon && <TypeIcon aria-hidden="true" className="size-3.5" />}
                          {taskTypeLabel(row.taskType)}
                        </span>
                        <span className="min-w-0 break-words xl:hidden">Created by: {creator}</span>
                        {!hasRecords && row.description && (
                          <span className="max-w-full truncate" title={row.description}>
                            {row.description}
                          </span>
                        )}
                        {row.contactId && (
                          <RecordLink href={`/contacts/${row.contactId}`} icon={User}>
                            {formatContactName({
                              firstName: row.contactFirstName,
                              middleName: row.contactMiddleName,
                              lastName: row.contactLastName,
                            })}
                          </RecordLink>
                        )}
                        {row.propertyId && (
                          <RecordLink
                            href={`/properties/buildings/${row.propertyId}`}
                            icon={Building2}
                          >
                            {row.propertyTitle}
                          </RecordLink>
                        )}
                        {row.dealId && (
                          <RecordLink href={`/deals/${row.dealId}`} icon={Briefcase}>
                            {row.dealTitle}
                          </RecordLink>
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

                  <TableCell className="hidden px-4 py-3 xl:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      {TypeIcon && <TypeIcon aria-hidden="true" className="size-3.5 shrink-0" />}
                      {taskTypeLabel(row.taskType)}
                    </span>
                  </TableCell>

                  <TableCell className="hidden px-4 py-3 sm:table-cell">
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
                        {formatDate(row.dueAt)}
                      </span>
                    )}
                    {row.reminderAt && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Bell aria-hidden="true" className="size-3 shrink-0" />
                        {manilaDateTime(row.reminderAt)}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="hidden px-4 py-3 md:table-cell">
                    <TaskBadge tone={TASK_PRIORITY_TONES[row.priority] ?? "muted"}>
                      {titleCase(row.priority)}
                    </TaskBadge>
                  </TableCell>

                  <TableCell className="hidden px-4 py-3 lg:table-cell">
                    {assignee ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <InitialsAvatar
                          className="size-7 text-[10px]"
                          initials={`${row.assignedFirstName?.[0] ?? ""}${row.assignedLastName?.[0] ?? ""}`.toUpperCase()}
                        />
                        <span
                          className="text-xs text-foreground [overflow-wrap:anywhere]"
                          title={assignee}
                        >
                          {assignee}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>

                  <TableCell className="hidden px-4 py-3 xl:table-cell">
                    <span className="flex min-w-0 items-center gap-2">
                      <User aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs [overflow-wrap:anywhere]">{creator}</span>
                    </span>
                  </TableCell>

                  <TableCell className="py-3 pl-2 pr-0 sm:pl-4">
                    <div className="flex min-w-0 items-center justify-end">
                      {canUpdate ? (
                        <TaskStatus id={row.id} status={row.status} />
                      ) : (
                        <TaskBadge tone={status.tone}>{status.label}</TaskBadge>
                      )}
                    </div>
                  </TableCell>
                  {editable && (
                    <TableCell className="w-16 px-3 py-3 text-center">
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
