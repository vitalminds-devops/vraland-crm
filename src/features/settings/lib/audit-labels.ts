import type { DotBadgeTone } from "@/components/ui/dot-badge";

const actionCopy: Record<string, { label: string; tone: DotBadgeTone }> = {
  create: { label: "Created", tone: "green" },
  update: { label: "Updated", tone: "blue" },
  delete: { label: "Deleted", tone: "red" },
  restore: { label: "Restored", tone: "green" },
  approve: { label: "Approved", tone: "green" },
  reject: { label: "Rejected", tone: "red" },
  assign: { label: "Assigned", tone: "purple" },
  reassign: { label: "Reassigned", tone: "purple" },
  generate_units: { label: "Generated units", tone: "purple" },
  contact_broker_override: { label: "Broker override", tone: "amber" },
};

const entityCopy: Record<string, string> = {
  agent: "Agent",
  automation_enrollment: "Automation enrollment",
  automation_sequence: "Automation sequence",
  automation_step: "Automation step",
  bill: "Bill",
  calendar_event: "Calendar event",
  campaign: "Campaign",
  contact: "Contact",
  contacts: "Contacts",
  contact_document_requirement: "Client document",
  contact_note: "Contact note",
  deal: "Opportunity",
  deal_stage_change_request: "Stage change request",
  development: "Development",
  document: "Document",
  document_signer: "Document signer",
  document_template: "Document template",
  email_template: "Email template",
  floor: "Floor",
  offer: "Offer",
  payment: "Payment",
  property: "Property",
  property_access_grant: "Property access grant",
  property_media: "Property media",
  property_viewing: "Viewing",
  role_permissions: "Role permissions",
  sms_template: "SMS template",
  task: "Task",
  unit: "Unit",
  user: "User",
  user_profile: "Own profile",
};

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auditActionCopy(action: string): {
  label: string;
  tone: DotBadgeTone;
} {
  return (
    actionCopy[action.toLowerCase()] ?? {
      label: titleCase(action),
      tone: "gray",
    }
  );
}

export function auditEntityLabel(entityType: string): string {
  return entityCopy[entityType] ?? titleCase(entityType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function changedAuditFields(oldValues: unknown, newValues: unknown): string[] {
  const keys = new Set<string>();
  for (const values of [oldValues, newValues]) {
    if (isRecord(values)) {
      for (const key of Object.keys(values)) keys.add(key);
    }
  }
  return [...keys];
}

/** `floorId` → "Floor", `deletedAt` → "Deleted at". */
export function auditFieldLabel(field: string): string {
  const words = field
    .replace(/(?<=.)(Id|_id)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T/;

export function formatAuditValue(value: unknown, formatDate: (iso: string) => string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (uuidPattern.test(value)) return value.slice(0, 8);
    if (isoDatePattern.test(value)) return formatDate(value);
    return value.replace(/_/g, " ");
  }
  return JSON.stringify(value);
}

/** Best human name for the record, taken from whatever values were logged. */
export function auditRecordName(oldValues: unknown, newValues: unknown): string | null {
  for (const values of [newValues, oldValues]) {
    if (!isRecord(values)) continue;
    for (const key of ["name", "title", "label", "code", "email"]) {
      if (typeof values[key] === "string" && values[key]) return values[key] as string;
    }
    const fullName = [values.firstName, values.lastName]
      .filter((part) => typeof part === "string" && part)
      .join(" ");
    if (fullName) return fullName;
  }
  return null;
}
