import { expect, it } from "vitest";
import { visibleActivityPrefixes } from "./activity-modules";

it("shows activity only from the modules a user can open", () => {
  const has = (keys: string[]) => (key: string) => keys.includes(key);
  expect(visibleActivityPrefixes(has(["deals.view"]))).toEqual(["deal"]);
  expect(visibleActivityPrefixes(has(["calendar.view", "properties.view"]))).toEqual([
    "calendar",
    "viewing",
    "property",
    "unit",
  ]);
  expect(visibleActivityPrefixes(has([]))).toEqual([]);
});
