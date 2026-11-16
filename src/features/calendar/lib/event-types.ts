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
