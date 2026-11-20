import { expect, it } from "vitest";
import { cleanAddressText } from "./id-address-clean";

const clean = (text: string) => cleanAddressText(text).text;

it("strips pipes, edge junk and label remnants and reads a dot between words as a comma", () => {
  expect(clean("hE | BONIFACIO ST ZONE 3. IBABA, CALAPAN CITY")).toBe(
    "BONIFACIO ST ZONE 3, IBABA, CALAPAN CITY",
  );
  expect(clean("Tirahan/Addres. I| SITIO X, BACO, %-\nORIENTAL MINDORO, 5201 Pp.\nyd")).toBe(
    "SITIO X, BACO\nORIENTAL MINDORO, 5201",
  );
  expect(clean("MABINI ST.,, ZONE. 3.  IBABA")).toBe("MABINI ST, ZONE 3, IBABA");
  expect(clean("BONIFACIO ST_ZONE 3 18ABA py")).toBe("BONIFACIO ST ZONE 3 IBABA");
});

it("reads look-alike digits inside words as letters but never changes numbers", () => {
  const { text, fixed } = cleanAddressText("#12 1ST ST, LOT 15B, SAN PEDR0, 8ACO 5201");
  expect(text).toBe("#12 1ST ST, LOT 15B, SAN PEDRO, BACO 5201");
  expect([...fixed]).toEqual(["PEDRO", "BACO"]);
});

it("spells out barangay and saint abbreviations and keeps short real words", () => {
  expect(clean("NO 5 BRGY. STO. NIÑO, STA. CRUZ, POB.")).toBe(
    "NO 5 BARANGAY SANTO NIÑO, SANTA CRUZ, POBLACION",
  );
  expect(clean("COMMONWEALTH Q.C.")).toBe("COMMONWEALTH QC");
});

it("keeps short words on a line typed in mixed case", () => {
  expect(clean("Address: 123 Rizal St\nLahug, Cebu City")).toBe("123 Rizal St\nLahug, Cebu City");
});
