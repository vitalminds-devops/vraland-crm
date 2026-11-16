import { describe, expect, it } from "vitest";

import {
  auditActionCopy,
  auditEntityLabel,
  auditFieldLabel,
  auditRecordName,
  changedAuditFields,
  formatAuditValue,
} from "./audit-labels";

describe("auditFieldLabel", () => {
  it.each([
    ["floorId", "Floor"],
    ["deletedAt", "Deleted at"],
    ["deleted_at", "Deleted at"],
    ["imageStorageKey", "Image storage key"],
    ["code", "Code"],
    // A field that is only "id", or merely ends in "id", keeps its letters.
    ["id", "Id"],
    ["paid", "Paid"],
  ])("labels %s as %s", (field, label) => {
    expect(auditFieldLabel(field)).toBe(label);
  });
});

describe("formatAuditValue", () => {
  const date = (iso: string) => `date:${iso}`;

  it("shows a dash for empty values and Yes/No for booleans", () => {
    expect(formatAuditValue(null, date)).toBe("—");
    expect(formatAuditValue(undefined, date)).toBe("—");
    expect(formatAuditValue("", date)).toBe("—");
    expect(formatAuditValue(true, date)).toBe("Yes");
    expect(formatAuditValue(false, date)).toBe("No");
    expect(formatAuditValue(0, date)).toBe("0");
  });

  it("shortens ids, formats timestamps and spaces out snake_case", () => {
    expect(formatAuditValue("f15a950b-1111-2222-3333-444455556666", date)).toBe("f15a950b");
    expect(formatAuditValue("2026-11-10T01:31:00.000Z", date)).toBe(
      "date:2026-11-10T01:31:00.000Z",
    );
    expect(formatAuditValue("for_sale", date)).toBe("for sale");
    expect(formatAuditValue({ a: 1 }, date)).toBe('{"a":1}');
  });
});

describe("auditRecordName", () => {
  it("prefers the new values, then the old ones", () => {
    expect(auditRecordName({ code: "1A" }, { code: "1B" })).toBe("1B");
    expect(auditRecordName({ title: "Tower 2" }, { floorId: "x" })).toBe("Tower 2");
  });

  it("uses a person's full name and returns null when nothing names the record", () => {
    expect(auditRecordName(null, { firstName: "Ana", lastName: "Cruz" })).toBe("Ana Cruz");
    expect(auditRecordName({ status: "sold" }, null)).toBeNull();
    expect(auditRecordName("not an object", [])).toBeNull();
  });
});

it("collects every changed field once, from either side", () => {
  expect(changedAuditFields({ status: "a", code: "1" }, { status: "b", floorId: "f" })).toEqual([
    "status",
    "code",
    "floorId",
  ]);
  expect(changedAuditFields(null, undefined)).toEqual([]);
});

it("falls back to title case for unknown actions and record types", () => {
  expect(auditActionCopy("create")).toEqual({ label: "Created", tone: "green" });
  expect(auditActionCopy("bulk_import")).toEqual({ label: "Bulk Import", tone: "gray" });
  expect(auditEntityLabel("deal")).toBe("Opportunity");
  expect(auditEntityLabel("parking_slot")).toBe("Parking Slot");
});
