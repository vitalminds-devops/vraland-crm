import { expect, it } from "vitest";
import { initialsOf } from "./user-types";

it.each([
  ["ana", "cruz", "AC"],
  ["\u{1F600} Ana", "Cruz", "\u{1F600}C"],
  ["Ana", "\u{10428}ruz", "A\u{10400}"],
  ["", "", ""],
])("keeps complete Unicode initials for %s %s", (firstName, lastName, expected) => {
  const initials = initialsOf({ firstName, lastName });
  expect(initials).toBe(expected);
  expect(Buffer.from(initials, "utf8").toString("utf8")).toBe(initials);
});
