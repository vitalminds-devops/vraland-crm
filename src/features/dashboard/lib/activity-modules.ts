import type { PermissionKey } from "@/lib/permissions/catalog";

/** Which module each kind of activity belongs to, by the start of its type ("deal.stage_changed"). */
const activityModules: Record<string, PermissionKey> = {
  contact: "contacts.view",
  deal: "deals.view",
  task: "tasks.view",
  calendar: "calendar.view",
  viewing: "calendar.view",
  property: "properties.view",
  unit: "properties.view",
  development: "developments.view",
  document: "documents.view",
};

/**
 * The activity type prefixes someone may see in Recent activity: only those of modules they can
 * open. A type with a prefix not listed here shows to nobody, so add new prefixes here.
 */
export function visibleActivityPrefixes(has: (key: PermissionKey) => boolean): string[] {
  return Object.entries(activityModules).flatMap(([prefix, key]) => (has(key) ? [prefix] : []));
}
