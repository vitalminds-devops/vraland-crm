import { CalendarCheck2, CalendarRange, Clock3, Download } from "lucide-react";

import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardToolbar } from "@/components/ui/card";
import { TaskFilters } from "@/features/tasks/components/task-filters";
import { TasksNav } from "@/features/tasks/components/tasks-nav";
import { TasksTable } from "@/features/tasks/components/tasks-table";
import { getTaskOptions, isTaskSortKey, listTasks } from "@/features/tasks/queries/task.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";

/** Matches the contacts table, so both screens page the same way. */
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    priority?: string;
    timing?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requirePagePermission("tasks.view");
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = PAGE_SIZES.includes(Number(q.pageSize)) ? Number(q.pageSize) : DEFAULT_PAGE_SIZE;
  const sort = isTaskSortKey(q.sort) ? q.sort : undefined;
  const dir = q.dir === "asc" || q.dir === "desc" ? q.dir : undefined;

  const [data, options] = await Promise.all([
    listTasks({
      page,
      pageSize,
      search: q.search,
      status: q.status,
      priority: q.priority,
      timing: q.timing,
      sort,
      dir,
      mine: true,
    }),
    getTaskOptions(),
  ]);

  const preservedParams = new URLSearchParams();
  if (sort) preservedParams.set("sort", sort);
  if (dir) preservedParams.set("dir", dir);
  if (pageSize !== DEFAULT_PAGE_SIZE) preservedParams.set("pageSize", String(pageSize));
  const preservedQuery = preservedParams.toString();

  const metricHref = (timing: string) => {
    const params = new URLSearchParams(preservedQuery);
    params.set("timing", timing);
    return `/tasks/my-tasks?${params}`;
  };

  const hasActiveFilters = Boolean(q.search || q.status || q.priority || q.timing);

  // The export takes the same filters and sort as the table.
  const exportParams = new URLSearchParams({ mine: "1" });
  for (const [key, value] of Object.entries({
    search: q.search,
    status: q.status,
    priority: q.priority,
    timing: q.timing,
    sort,
    dir,
  }))
    if (value) exportParams.set(key, value);
  const exportHref = `/api/tasks/export?${exportParams}`;

  return (
    <PageContainer>
      <PageHeader title="My tasks" description="Assigned to you." />

      <TasksNav
        current="/tasks/my-tasks"
        action={
          <a href={exportHref} className={buttonVariants({ variant: "secondary" })}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            Export
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Overdue"
          value={data.summary.overdue.toLocaleString()}
          detail="Past due and open."
          icon={Clock3}
          href={metricHref("overdue")}
          active={q.timing === "overdue"}
        />
        <StatCard
          label="Due today"
          value={data.summary.today.toLocaleString()}
          detail="Due by end of day."
          icon={CalendarCheck2}
          href={metricHref("today")}
          active={q.timing === "today"}
        />
        <StatCard
          label="Upcoming"
          value={data.summary.upcoming.toLocaleString()}
          detail="Scheduled beyond today."
          icon={CalendarRange}
          href={metricHref("upcoming")}
          active={q.timing === "upcoming"}
        />
      </div>

      <Card className="mt-6">
        <CardToolbar>
          <TaskFilters
            search={q.search}
            status={q.status}
            priority={q.priority}
            timing={q.timing}
            preservedQuery={preservedQuery}
          />
        </CardToolbar>
        <CardContent className="p-0">
          <TasksTable
            rows={data.rows}
            page={page}
            pages={data.pages}
            pageSize={pageSize}
            sort={sort}
            dir={dir}
            canUpdate={data.canUpdate}
            canDelete={data.canDelete}
            options={options}
            hasActiveFilters={hasActiveFilters}
            emptyAction={
              hasActiveFilters ? (
                <ButtonLink href="/tasks/my-tasks" variant="secondary">
                  Clear filters
                </ButtonLink>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
