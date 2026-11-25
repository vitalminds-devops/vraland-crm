import { expect, it } from "vitest";
import { writeErrorMessage } from "./contact-write-error";

it.each([
  [
    { code: "23505", constraint: "contacts_org_email_normalized_unique" },
    "Another contact already uses this email.",
  ],
  [{ code: "23502", column: "last_name" }, "Enter the last name."],
  [{ code: "22001" }, "One of the fields is too long. Shorten it and try again."],
  [
    { code: "42703" },
    "The database is out of date. Ask an Administrator to run the database migrations.",
  ],
  [{ code: "40001" }, null],
  [{}, null],
])("explains %o", (error, message) => {
  expect(writeErrorMessage(error)).toBe(message);
});
