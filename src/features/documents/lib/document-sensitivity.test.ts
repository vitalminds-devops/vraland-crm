import { expect, it } from "vitest";
import { isSensitiveDocument } from "./document-sensitivity";

it("marks client files sensitive from any upload path, except the appointment form", () => {
  expect(isSensitiveDocument("valid_id", "id")).toBe(true);
  expect(isSensitiveDocument("tax_return", null)).toBe(true);
  expect(isSensitiveDocument("client_appointment_form", "contract")).toBe(false);
  expect(isSensitiveDocument("general", "other")).toBe(false);
  expect(isSensitiveDocument("general", "contract")).toBe(true);
});
