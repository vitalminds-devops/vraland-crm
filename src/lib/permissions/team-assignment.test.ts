import { describe, it, expect } from "vitest";
import { teamMemberRoles, allowsTeamMember } from "./team-assignment";
describe("team assignments", () => {
  it.each(["broker", "license-broker", "network-partner-ind"])(
    "%s leads Sales Executives and Agents",
    (manager) => {
      expect(allowsTeamMember([manager], ["sales-executive"])).toBe(true);
      expect(allowsTeamMember([manager], ["agent"])).toBe(true);
      expect(allowsTeamMember([manager], ["sales-executive-ih"])).toBe(false);
      expect(allowsTeamMember([manager], ["sales-executive-ind"])).toBe(false);
    },
  );
  it.each(["sales-director-ih", "network-partner-ih"])(
    "%s leads Sales Executive IH and Agents",
    (manager) => {
      expect(allowsTeamMember([manager], ["sales-executive-ih"])).toBe(true);
      expect(allowsTeamMember([manager], ["agent"])).toBe(true);
      expect(allowsTeamMember([manager], ["sales-executive"])).toBe(false);
    },
  );
  it("does not let a broker lead another broker", () =>
    expect(allowsTeamMember(["broker"], ["broker"])).toBe(false));
  it("combines manager roles without duplicate options", () =>
    expect(teamMemberRoles(["broker", "license-broker", "sales-director-ih"])).toEqual([
      "sales-executive",
      "agent",
      "sales-executive-ih",
    ]));
  it("blocks executive assignments to unrelated roles", () =>
    expect(allowsTeamMember(["sales-executive"], ["sales-executive"])).toBe(false));
  it("preserves unrelated legacy assignments", () =>
    expect(allowsTeamMember(["master-broker"], ["consultant-ih"])).toBe(true));
});

describe("Master Broker teams", () => {
  it("offers brokers only to Master Brokers", async () => {
    const { assignedBrokerRoles } = await import("./team-assignment");
    expect(assignedBrokerRoles(["master-broker"])).toEqual(["broker", "license-broker"]);
    expect(assignedBrokerRoles(["broker"])).toEqual([]);
    expect(assignedBrokerRoles(["administrator"])).toEqual([]);
  });
});
