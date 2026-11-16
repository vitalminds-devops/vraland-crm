import { describe, expect, it } from "vitest";

import { isCloseDateOverdue } from "./close-date";

describe("isCloseDateOverdue", () => {
  const today = "2026-11-16";

  it("flags an open opportunity past its close date", () => {
    expect(isCloseDateOverdue("2026-11-04", false, today)).toBe(true);
  });

  it("never flags a closed opportunity", () => {
    expect(isCloseDateOverdue("2026-11-04", true, today)).toBe(false);
  });

  it("is not overdue on the day itself, later, or without a date", () => {
    expect(isCloseDateOverdue(today, false, today)).toBe(false);
    expect(isCloseDateOverdue("2026-12-01", false, today)).toBe(false);
    expect(isCloseDateOverdue(null, false, today)).toBe(false);
  });
});
