type Viewer = { userId: string; permissions: ReadonlySet<string> };

/** An event (not a viewing) is changed or deleted by its creator, or by someone allowed others'. */
export function canChangeEvent(viewer: Viewer, createdBy: string | null) {
  return (
    viewer.permissions.has("calendar.manage") &&
    (createdBy === viewer.userId || viewer.permissions.has("calendar.edit_others"))
  );
}

/** Someone else's event waits for their answer; your own needs none. */
export const assignmentStatus = (assigneeId: string, creatorId: string | null) =>
  assigneeId === creatorId ? "accepted" : "needs_action";

export type AssignmentStatus = "needs_action" | "accepted" | "declined";

/** One person invited to an event, and their answer. */
export type Invitee = {
  userId: string;
  name: string;
  status: string;
  note: string | null;
};

/**
 * The answer to show for an event. Someone invited sees their own answer; the creator (or
 * anyone else who can see it) sees the group's: declined if anyone declined, waiting while
 * anyone hasn't answered, else accepted. Null when nobody but the creator is invited.
 */
export function responseSummary(
  invitees: Invitee[],
  creatorId: string | null,
  viewerId: string,
): AssignmentStatus | null {
  const others = invitees.filter((person) => person.userId !== creatorId);
  if (!others.length) return null;
  const mine = others.find((person) => person.userId === viewerId);
  if (mine) return mine.status as AssignmentStatus;
  if (others.some((person) => person.status === "declined")) return "declined";
  if (others.some((person) => person.status === "needs_action")) return "needs_action";
  return "accepted";
}
