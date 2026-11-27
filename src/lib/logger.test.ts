import { afterEach, expect, it, vi } from "vitest";

import { logError, logInfo, logWarn } from "./logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("includes the database error code in production without logging query parameters", () => {
  vi.stubEnv("NODE_ENV", "production");
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
  });
  const error = new Error("Failed query: insert into contacts; params: private@example.com", {
    cause,
  });

  logError("Contact write failed", error, { operation: "contact_write" });

  expect(output).toHaveBeenCalledOnce();
  const message = output.mock.calls[0][0];
  expect(message).toContain("Code: 23505");
  expect(message).toContain("duplicate key value violates unique constraint");
  expect(message).not.toContain("private@example.com");
  expect(message).not.toContain("Stack:");
});

it("keeps info and warnings out of production logs", () => {
  vi.stubEnv("NODE_ENV", "production");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  logInfo("Lead expiry: leads expired", { count: 2 });
  logWarn("Email service: SMTP not configured.");
  expect(info).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it("shows info with its context in development", () => {
  vi.stubEnv("NODE_ENV", "development");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  logInfo("Lead expiry: leads expired", { count: 2 });
  expect(info.mock.calls[0][0]).toContain('{"count":2}');
});
