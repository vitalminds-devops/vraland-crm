import { expect, it } from "vitest";
import { formatRecordCode } from "./record-code";

it("pads each kind to its width and never cuts a longer number", () => {
  expect(formatRecordCode("opportunity", 123)).toBe("OPP-000123");
  expect(formatRecordCode("contact", 45)).toBe("CON-000045");
  expect(formatRecordCode("property", 7)).toBe("PROP-0007");
  expect(formatRecordCode("development", 3)).toBe("DEV-0003");
  expect(formatRecordCode("property", 12345)).toBe("PROP-12345");
});
