import { expect, it } from "vitest";
import { resetErrorMessage } from "./reset-error";

it("says the link expired only for a bad or used link", () => {
  expect(resetErrorMessage({ code: "INVALID_TOKEN", message: "Invalid token" })).toBe(
    "Link expired. Request a new one.",
  );
  expect(resetErrorMessage({ code: "PASSWORD_TOO_SHORT", message: "Password too short" })).toBe(
    "Password too short",
  );
  expect(resetErrorMessage({})).toBe("Couldn't update the password. Try again.");
});
