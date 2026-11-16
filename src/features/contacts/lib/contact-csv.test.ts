import { describe, expect, it } from "vitest";

import { csvCell, unguardCell } from "./contact-csv";

describe("unguardCell", () => {
  it("strips the guard csvCell added, and nothing else", () => {
    expect(unguardCell("'=HYPERLINK(1)")).toBe("=HYPERLINK(1)");
    expect(unguardCell("'@SUM(A1)")).toBe("@SUM(A1)");
    expect(unguardCell("O'Brien")).toBe("O'Brien");
    expect(unguardCell("'quoted'")).toBe("'quoted'");
  });
});

describe("csvCell", () => {
  it("doubles quotes so a value cannot shift columns", () => {
    expect(csvCell('ACME "Prime"')).toBe('"ACME ""Prime"""');
  });

  it("neutralises formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("+cmd|' /C calc'!A0")).toBe(`"'+cmd|' /C calc'!A0"`);
  });

  it("keeps phone numbers and negative numbers intact", () => {
    expect(csvCell("+63 917 123 4567")).toBe('"+63 917 123 4567"');
    expect(csvCell("-500")).toBe('"-500"');
    expect(csvCell("")).toBe('""');
  });
});
