import { expect, it } from "vitest";
import { eventResponseSchema } from "./calendar.schema";

const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

it("needs a reason to decline but not to accept", () => {
  expect(eventResponseSchema.safeParse({ eventId, response: "accepted" }).success).toBe(true);
  expect(eventResponseSchema.safeParse({ eventId, response: "declined" }).success).toBe(false);
  expect(
    eventResponseSchema.safeParse({ eventId, response: "declined", note: "   " }).success,
  ).toBe(false);
  expect(
    eventResponseSchema.safeParse({ eventId, response: "declined", note: "On leave that day" })
      .success,
  ).toBe(true);
});
