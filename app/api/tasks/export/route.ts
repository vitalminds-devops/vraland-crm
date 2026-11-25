import { formatContactName } from "@/features/contacts/lib/helpers";
import { isTaskSortKey, listTasks } from "@/features/tasks/queries/task.queries";
import { taskTypeLabel } from "@/features/tasks/lib/task-options";
import { csvResponse, limitNote } from "@/lib/http/csv";
import { getAuthorizationContext } from "@/lib/permissions/authorization";
import { hasPermission } from "@/lib/permissions/policy";
import { manilaDate, manilaDateTimeLocal } from "@/lib/utils/manila-time";

// shortcut: one page of 10,000 tasks; the file ends with a note when cut off.
const EXPORT_LIMIT = 10_000;

/** The task list under the page's filters and sort; `mine=1` for My tasks. */
export async function GET(request: Request) {
  const context = await getAuthorizationContext();
  if (!context) return new Response("Authentication is required", { status: 401 });
  if (!hasPermission(context, "tasks.view")) return new Response("Forbidden", { status: 403 });

  const params = new URL(request.url).searchParams;
  const sort = params.get("sort") ?? undefined;
  const dir = params.get("dir");
  const data = await listTasks({
    page: 1,
    pageSize: EXPORT_LIMIT,
    search: params.get("search") || undefined,
    status: params.get("status") || undefined,
    priority: params.get("priority") || undefined,
    timing: params.get("timing") || undefined,
    sort: isTaskSortKey(sort) ? sort : undefined,
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
    mine: params.get("mine") === "1",
  });
  // Manila wall-clock time, readable in a spreadsheet.
  const when = (date: Date | null) => (date ? manilaDateTimeLocal(date).replace("T", " ") : null);

  return csvResponse(
    [
      [
        "Task",
        "Type",
        "Priority",
        "Status",
        "Due",
        "Assignee",
        "Contact",
        "Opportunity",
        "Property",
        "Description",
      ],
      ...data.rows.map((task) => [
        task.title,
        taskTypeLabel(task.taskType),
        task.priority,
        task.status,
        when(task.dueAt),
        [task.assignedFirstName, task.assignedLastName].filter(Boolean).join(" "),
        task.contactId
          ? formatContactName({
              firstName: task.contactFirstName ?? "",
              middleName: task.contactMiddleName,
              lastName: task.contactLastName ?? "",
            })
          : null,
        task.dealTitle,
        task.propertyTitle,
        task.description,
      ]),
      ...limitNote(data.rows.length, EXPORT_LIMIT),
    ],
    `vra-tasks-${manilaDate()}.csv`,
  );
}
