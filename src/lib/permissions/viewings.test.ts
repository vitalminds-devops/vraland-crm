import { expect, it } from "vitest";
import { canEditViewing, type ViewingReference } from "./viewings";

const viewing: ViewingReference = {
  id: "viewing",
  organizationId: "org",
  agentUserId: "agent",
  eventCreatedBy: "creator",
  contactId: "contact",
  propertyId: "property",
  dealId: "deal",
};
const user = (userId: string, permissions: string[]) => ({
  authUserId: "auth",
  userId,
  organizationId: "org",
  roles: [],
  permissions: new Set(permissions),
});

it("lets the agent, the creator or a deal participant change a viewing", () => {
  const update = ["calendar.update_viewings"];
  expect(canEditViewing(user("agent", update), viewing)).toBe(true);
  expect(canEditViewing(user("creator", update), viewing)).toBe(true);
  expect(canEditViewing(user("partner", update), viewing, ["partner"])).toBe(true);
  expect(canEditViewing(user("stranger", update), viewing)).toBe(false);
});

it("needs the permission, the same organization, and all-records access for others' viewings", () => {
  expect(canEditViewing(user("agent", []), viewing)).toBe(false);
  expect(
    canEditViewing(user("agent", ["calendar.update_viewings"]), {
      ...viewing,
      organizationId: "x",
    }),
  ).toBe(false);
  expect(
    canEditViewing(user("manager", ["calendar.update_viewings", "records.view_all"]), viewing),
  ).toBe(true);
  // Deleting is its own permission.
  expect(
    canEditViewing(
      user("agent", ["calendar.update_viewings"]),
      viewing,
      undefined,
      "calendar.delete_viewings",
    ),
  ).toBe(false);
});
