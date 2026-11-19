export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Not specified";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dateObj);
}

export function getRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "Not specified";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return "Invalid date";

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? "s" : ""} ago`;
  if (diffDays < 365)
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? "s" : ""} ago`;
}

export function getInitials(firstName: string, lastName: string): string {
  return `${Array.from(firstName ?? "")[0] ?? ""}${Array.from(lastName ?? "")[0] ?? ""}`.toUpperCase();
}

export function formatContactName(input: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  const parts = [input.firstName, input.middleName].filter((part): part is string =>
    Boolean(part && part.trim()),
  );
  const given = parts.join(" ");
  const surname = input.lastName?.trim() ?? "";
  if (surname && given) return `${surname}, ${given}`;
  return surname || given || "Unnamed contact";
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
