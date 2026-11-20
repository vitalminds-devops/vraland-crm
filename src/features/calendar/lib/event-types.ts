import type { AssignmentStatus, Invitee } from "./event-access";

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  eventType: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  contactId?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  viewingId: string | null;
  viewingStatus: string | null;
  propertyTitle?: string | null;
  contactFirstName?: string | null;
  contactMiddleName?: string | null;
  contactLastName?: string | null;
  agentFirstName?: string | null;
  agentLastName?: string | null;
  ownerId?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  /** Everyone invited, with their answer. */
  invitees?: Invitee[];
  /** The answer to show: the viewer's own when invited, else the group's. */
  responseStatus?: AssignmentStatus | null;
  /** Only the creator, or someone allowed to change others' events. */
  canEdit?: boolean;
  canDelete?: boolean;
  /** The viewer is invited and can accept or decline. */
  canRespond?: boolean;
};

/** Display name of the linked contact, or null. */
export function contactName(event: CalendarEvent): string | null {
  if (!event.contactFirstName) return null;
  return [event.contactFirstName, event.contactLastName].filter(Boolean).join(" ").trim();
}

/** Display name of the event owner (creator), or null. */
export function ownerName(event: CalendarEvent): string | null {
  if (!event.ownerFirstName) return null;
  return `${event.ownerFirstName} ${event.ownerLastName ?? ""}`.trim();
}

/** How an answer reads in the calendar. */
export const RESPONSE_LABELS: Record<AssignmentStatus, string> = {
  accepted: "Accepted",
  declined: "Declined",
  needs_action: "Waiting for response",
};

/** The answer to show for the event, or null when nobody else is invited. */
export function responseLabel(event: CalendarEvent): string | null {
  return event.viewingId || !event.responseStatus ? null : RESPONSE_LABELS[event.responseStatus];
}
