import { expect, it } from "vitest";
import { canAssignTask } from "./task-assignee";

const as = (...permissions: string[]) => ({ userId: "me", permissions: new Set(permissions) });
const user = (
  id: string,
  extra: Partial<{ brokerId: string; status: string; deletedAt: Date }> = {},
) => ({
  id,
  brokerId: null,
  status: "active",
  deletedAt: null,
  ...extra,
});
const own = as("records.view_own");
const team = as("records.view_team");
const all = as("records.view_all");

it("lets own scope assign only themselves", () => {
  expect(canAssignTask(own, user("me"))).toBe(true);
  expect(canAssignTask(own, user("member", { brokerId: "me" }))).toBe(false);
});

it("lets team scope assign themselves or their team", () => {
  expect(canAssignTask(team, user("me"))).toBe(true);
  expect(canAssignTask(team, user("member", { brokerId: "me" }))).toBe(true);
  expect(canAssignTask(team, user("other", { brokerId: "lead" }))).toBe(false);
});

it("lets all scope assign anyone active", () => {
  expect(canAssignTask(all, user("other", { brokerId: "lead" }))).toBe(true);
});

it("refuses inactive, archived or unknown users", () => {
  expect(canAssignTask(all, user("other", { status: "inactive" }))).toBe(false);
  expect(canAssignTask(all, user("other", { deletedAt: new Date() }))).toBe(false);
  expect(canAssignTask(all, undefined)).toBe(false);
});
