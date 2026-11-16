import { resolveDataScope, type AuthorizationContext } from "@/lib/permissions/policy";

export type TaskAssigneeCandidate = {
  id: string;
  brokerId: string | null;
  status: string;
  deletedAt: Date | null;
};

export const taskAssigneeError = "Assign the task to someone in your team.";

/** Same reach as scopedAgentCondition, which filters the assignee picker. */
export function canAssignTask(
  context: Pick<AuthorizationContext, "userId" | "permissions">,
  user: TaskAssigneeCandidate | undefined,
): boolean {
  if (!user || user.status !== "active" || user.deletedAt) return false;
  const scope = resolveDataScope(context);
  if (scope === "organization" || user.id === context.userId) return true;
  return scope === "broker_team" && user.brokerId === context.userId;
}
