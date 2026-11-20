import { expect, it } from "vitest";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { assignmentStatus, canChangeEvent, responseSummary } from "./event-access";
import { responseLabel } from "./event-types";

const viewer = (userId: string, ...keys: PermissionKey[]) => ({
  userId,
  permissions: new Set<PermissionKey>(keys),
});

it("lets only the creator change an event, unless allowed to change others'", () => {
  expect(canChangeEvent(viewer("me", "calendar.manage"), "me")).toBe(true);
  expect(canChangeEvent(viewer("me", "calendar.manage"), "someone")).toBe(false);
  expect(canChangeEvent(viewer("me", "calendar.manage", "calendar.edit_others"), "someone")).toBe(
    true,
  );
  // Without Manage calendar nobody changes events, not even their own.
  expect(canChangeEvent(viewer("me", "calendar.view"), "me")).toBe(false);
});

it("asks the person assigned to respond unless they assigned it to themselves", () => {
  expect(assignmentStatus("me", "me")).toBe("accepted");
  expect(assignmentStatus("agent", "me")).toBe("needs_action");
});

it("labels the answer to show, and nothing for viewings or events with no one else invited", () => {
  const event = {
    id: "e",
    title: "Site visit",
    eventType: "general",
    startAt: new Date(),
    endAt: new Date(),
    allDay: false,
    location: null,
    viewingId: null,
    viewingStatus: null,
    ownerId: "creator",
  };
  expect(responseLabel({ ...event, responseStatus: "needs_action" })).toBe("Waiting for response");
  expect(responseLabel({ ...event, responseStatus: "declined" })).toBe("Declined");
  expect(responseLabel({ ...event, responseStatus: null })).toBeNull();
  expect(responseLabel({ ...event, viewingId: "v", responseStatus: "accepted" })).toBeNull();
});

it("summarises answers: your own when invited, else declined, then waiting, then accepted", () => {
  const person = (userId: string, status: string) => ({ userId, name: userId, status, note: null });
  const creator = person("creator", "accepted");
  expect(responseSummary([creator], "creator", "creator")).toBeNull();
  const group = [creator, person("a", "accepted"), person("b", "needs_action")];
  expect(responseSummary(group, "creator", "creator")).toBe("needs_action");
  expect(responseSummary(group, "creator", "a")).toBe("accepted");
  expect(responseSummary([...group, person("c", "declined")], "creator", "creator")).toBe(
    "declined",
  );
  expect(responseSummary([creator, person("a", "accepted")], "creator", "someone-else")).toBe(
    "accepted",
  );
});
