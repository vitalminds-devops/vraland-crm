import { expect, it } from "vitest";

import { formatDateTime } from "./helpers";

it("formats log timestamps in Philippine time, including the next calendar day", () => {
  expect(formatDateTime(new Date("2026-11-19T07:36:00Z"))).toBe("Nov 19, 2026, 3:36 PM");
  expect(formatDateTime("2026-11-19T23:36:00Z")).toBe("Nov 20, 2026, 7:36 AM");
});
