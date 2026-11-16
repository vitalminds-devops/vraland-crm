// Who each team-lead role may have reporting to it: its own Sales Executive role, and Agents.
const teamRolesFor: Record<string, readonly string[]> = {
  broker: ["sales-executive", "agent"],
  "license-broker": ["sales-executive", "agent"],
  "network-partner-ind": ["sales-executive", "agent"],
  "sales-director-ih": ["sales-executive-ih", "agent"],
  "network-partner-ih": ["sales-executive-ih", "agent"],
};

/** The member roles a manager with these roles may lead; empty means no rule applies (legacy roles). */
export const teamMemberRoles = (roles: string[]): string[] => [
  ...new Set(roles.flatMap((role) => teamRolesFor[role] ?? [])),
];

/** Whether someone with `member` roles may report to someone with `manager` roles. */
export function allowsTeamMember(manager: string[], member: string[]): boolean {
  const allowed = teamMemberRoles(manager);
  return allowed.length || member.some((role) => role.startsWith("sales-executive"))
    ? allowed.some((role) => member.includes(role))
    : true;
}

export const assignedBrokerRoles = (roles: string[]): string[] =>
  roles.includes("master-broker") ? ["broker", "license-broker"] : [];

/** Whether someone with `member` roles may report to a Master Broker. */
export const reportsToMasterBroker = (member: string[]): boolean =>
  assignedBrokerRoles(["master-broker"]).some((role) => member.includes(role));
