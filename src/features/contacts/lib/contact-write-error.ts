/** What the user can do about a database refusal, or null when there is nothing they can fix. */
export function writeErrorMessage(error: {
  code?: string;
  constraint?: string;
  column?: string;
}): string | null {
  const column = error.column?.replaceAll("_", " ");
  switch (error.code) {
    case "23505":
      return error.constraint === "contacts_org_email_normalized_unique"
        ? "Another contact already uses this email."
        : "This contact already exists. Refresh and check the contact list.";
    case "23502":
      return column ? `Enter the ${column}.` : "Fill in every required field.";
    case "22001":
      return "One of the fields is too long. Shorten it and try again.";
    case "22007":
    case "22008":
      return "One of the dates is not valid.";
    case "23503":
      return "The selected agent, development or unit no longer exists. Refresh and pick again.";
    case "42703":
    case "42P01":
      return "The database is out of date. Ask an Administrator to run the database migrations.";
    default:
      return null;
  }
}
