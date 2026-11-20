import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { AssignmentStatus } from "../lib/event-access";
import { declinedTitle, ResponseMark } from "./response-mark";

const event = {
  id: "e",
  title: "Site visit",
  eventType: "general",
  startAt: new Date("2026-11-20T02:00:00Z"),
  endAt: new Date("2026-11-20T03:00:00Z"),
  allDay: false,
  location: null,
  viewingId: null,
  viewingStatus: null,
  ownerId: "creator",
};

it("marks each answer, and nothing when no one else is invited", () => {
  const mark = (responseStatus: AssignmentStatus | null) =>
    renderToStaticMarkup(createElement(ResponseMark, { event: { ...event, responseStatus } }));
  expect(mark("accepted")).toContain("Accepted");
  expect(mark("declined")).toContain("Declined");
  expect(mark("needs_action")).toContain("Waiting for response");
  expect(mark(null)).toBe("");
  expect(declinedTitle({ ...event, responseStatus: "declined" })).toContain("line-through");
  expect(declinedTitle({ ...event, responseStatus: "accepted" })).toBe("");
});
