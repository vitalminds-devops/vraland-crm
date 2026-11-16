import { expect, it } from "vitest";

import { groupDigits } from "./group-digits";

it.each([
  ["5557727277711", "5557 7272 7771 1"],
  ["5557 72727", "5557 7272 7"],
  ["1234", "1234"],
  ["", ""],
  ["123-456-789", "123-456-789"],
])("groups %j as %j", (input, expected) => {
  expect(groupDigits(input)).toBe(expected);
});
