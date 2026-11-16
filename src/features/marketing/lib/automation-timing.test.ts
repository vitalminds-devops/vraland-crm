import { describe, expect, it } from "vitest";
import { stepDueAt, waitLabel } from "./automation-timing";

const anchor = new Date("2026-11-10T00:00:00Z");
const at = (minutes: number) => new Date(anchor.getTime() + minutes * 60_000);

it("delays a step by its own minutes", () => {
  expect(stepDueAt(anchor, { actionType: "send_email", delayMinutes: 30 }, null)).toEqual(at(30));
});

it("starts a wait step at once and holds back the step after it", () => {
  const wait = { actionType: "wait", delayMinutes: 60 };
  expect(stepDueAt(anchor, wait, null)).toEqual(at(0));
  expect(stepDueAt(anchor, { actionType: "create_task", delayMinutes: 5 }, wait)).toEqual(at(65));
});

describe("waitLabel", () => {
  it("reads minutes as days, hours and minutes", () => {
    expect(waitLabel(0)).toBe("Right away");
    expect(waitLabel(4_320)).toBe("3 days");
    expect(waitLabel(1_440 + 120)).toBe("1 day 2 hours");
    expect(waitLabel(45)).toBe("45 minutes");
  });
});
