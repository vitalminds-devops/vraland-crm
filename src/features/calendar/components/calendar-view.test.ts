import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CalendarView } from "./calendar-view";
import { CalendarToolbar } from "./calendar-toolbar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../actions/calendar.actions", () => ({ deleteCalendarEvent: vi.fn() }));
vi.mock("../actions/event-response.actions", () => ({ respondToCalendarEvent: vi.fn() }));

it.each([true, false])("keeps an empty month visible with creation permission %s", (canCreate) => {
  const html = renderToStaticMarkup(
    createElement(CalendarView, {
      date: new Date(2026, 10, 9),
      view: "month",
      events: [],
      basePath: "/calendar",
      activeFilter: "all",
      canCreate,
      onAddOnDate: vi.fn(),
    }),
  );
  expect(html).toContain('role="grid"');
  expect(html).toContain("Monday, November 9, 2026");
  expect(html.includes("Add event on November 9")).toBe(canCreate);
  expect(html).toContain("No events in this month.");
  expect(html.includes("Use Add event or Schedule viewing")).toBe(canCreate);
});

it("keeps navigation filters and actions together without zero count badges", () => {
  const html = renderToStaticMarkup(
    createElement(CalendarToolbar, {
      basePath: "/calendar",
      date: new Date(2026, 10, 9),
      view: "month",
      activeFilter: "viewing",
      counts: { all: 2, viewing: 2, follow_up: 0, closing: 0 },
      actions: createElement("button", null, "Schedule viewing"),
    }),
  );
  expect(html).toContain("November 2026");
  expect(html).toContain("Philippine time (UTC+8)");
  expect(html).toContain("All events");
  expect(html).toContain("lucide-phone");
  expect(html).toContain("lucide-key-round");
  expect(html).toContain("Schedule viewing");
  expect(html).toContain("date=2026-12-09&amp;view=month&amp;type=viewing");
  expect(html).toContain("date=2026-11-09&amp;view=week&amp;type=viewing");
  expect(html).not.toMatch(/>0<\/span>/);
  expect(html).toMatch(/>2<\/span>/);
});

it("keeps month navigation in February when starting on January 31", () => {
  const html = renderToStaticMarkup(
    createElement(CalendarToolbar, {
      basePath: "/calendar",
      date: new Date(2026, 0, 31),
      view: "month",
      activeFilter: "all",
      counts: { all: 0, viewing: 0, follow_up: 0, closing: 0 },
    }),
  );
  expect(html).toContain("date=2026-02-28&amp;view=month");
});

it("labels the full visible week across a month boundary", () => {
  const html = renderToStaticMarkup(
    createElement(CalendarToolbar, {
      basePath: "/calendar",
      date: new Date(2026, 10, 30),
      view: "week",
      activeFilter: "all",
      counts: { all: 0, viewing: 0, follow_up: 0, closing: 0 },
    }),
  );
  expect(html).toContain("Nov 29 – Dec 5, 2026");
});

it("explains when the selected filter has no events", () => {
  const html = renderToStaticMarkup(
    createElement(CalendarView, {
      date: new Date(2026, 10, 9),
      view: "month",
      events: [],
      basePath: "/calendar",
      activeFilter: "closing",
      canCreate: false,
      onAddOnDate: vi.fn(),
    }),
  );
  expect(html).toContain("No events match this filter");
  expect(html).toContain("Try All events");
  expect(html).not.toContain("Use Add event");
});
