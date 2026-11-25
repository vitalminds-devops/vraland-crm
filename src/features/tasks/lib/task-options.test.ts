import { expect, it } from "vitest";
import { taskTypeLabel } from "./task-options";

it("labels task types in sentence case", () => {
  expect(taskTypeLabel("follow_up")).toBe("Follow-up");
  expect(taskTypeLabel("site_visit")).toBe("Site visit");
});
