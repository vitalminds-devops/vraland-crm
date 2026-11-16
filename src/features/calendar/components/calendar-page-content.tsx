import { CalendarWorkspace } from "./calendar-workspace";
import type { CalendarFilter } from "../lib/event-colors";
import type { CalendarView as ViewId } from "./calendar-toolbar";
import { getCalendarOptions, listCalendarEvents } from "../queries/calendar.queries";
import { requirePagePermission } from "@/lib/permissions/authorization";
import { hasOrganizationWideAccess } from "@/lib/permissions/policy";
import { manilaToday } from "@/lib/utils/manila-time";
import { manilaViewRange } from "../lib/manila-range";

type CalendarQuery = { date?: string; view?: string; type?: string };

const VIEWS: ViewId[] = ["month", "week", "day", "agenda"];
const FILTERS: CalendarFilter["id"][] = ["all", "viewing", "follow_up", "closing"];

export async function CalendarPageContent({
  query,
  fixedType,
  title = "Calendar & viewings",
  description = "Viewings, follow-ups and closings.",
}: {
  query: CalendarQuery;
  fixedType?: string;
  title?: string;
  description?: string;
}) {
  const context = await requirePagePermission("calendar.view");
  // Manila's calendar, not the server's: a UTC server would otherwise drop each view's early hours.
  const day = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : manilaToday();
  const date = new Date(`${day}T12:00:00+08:00`);
  const view = (VIEWS.includes(query.view as ViewId) ? query.view : "month") as ViewId;
  const range = manilaViewRange(view, day);

  const queryType =
    fixedType ?? (query.type === "follow_up" || query.type === "closing" ? query.type : undefined);

  const [{ rows, canCreate }, options] = await Promise.all([
    listCalendarEvents({ ...range, type: queryType }),
    getCalendarOptions(),
  ]);

  const activeFilter = (fixedType ??
    (FILTERS.includes(query.type as CalendarFilter["id"])
      ? query.type
      : "all")) as CalendarFilter["id"];
  const basePath =
    fixedType === "follow_up"
      ? "/calendar/follow-ups"
      : fixedType === "closing"
        ? "/calendar/closings"
        : "/calendar";

  const canAssign = hasOrganizationWideAccess(context);
  const currentUserId = context.userId;

  return (
    <CalendarWorkspace
      title={title}
      description={description}
      basePath={basePath}
      backHref={fixedType ? "/calendar" : undefined}
      date={date}
      view={view}
      events={rows}
      activeFilter={activeFilter}
      canCreate={canCreate}
      options={options}
      canAssign={canAssign}
      currentUserId={currentUserId}
    />
  );
}
