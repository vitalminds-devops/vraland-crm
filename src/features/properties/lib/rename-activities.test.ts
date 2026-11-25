import { expect, it } from "vitest";
import { renameActivities } from "./rename-activities";

it("records one activity per renamed unit", () => {
  const rows = renameActivities({ organizationId: "org", userId: "me" }, "property", [
    { unitId: "a", from: "301", to: "310" },
    { unitId: "b", from: "302", to: "311" },
  ]);
  expect(rows.map((row) => row.summary)).toEqual([
    "Unit 301 was renamed to 310.",
    "Unit 302 was renamed to 311.",
  ]);
  expect(rows[0]).toMatchObject({ activityType: "unit.renamed", metadata: { unitId: "a" } });
});
