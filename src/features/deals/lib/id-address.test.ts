import { expect, it } from "vitest";
import {
  barangaysForCity,
  citiesForProvince,
  getCityCodeByName,
  postalCodeForCity,
} from "@/lib/location";
import { extractIdAddress, parseIdAddressLine } from "./id-address";
it("extracts a labelled Philippine address into the selector's canonical values", () => {
  expect(
    extractIdAddress(
      "REPUBLIC OF THE PHILIPPINES\nNAME: TEST BUYER\nADDRESS:\n123 RIZAL ST, BRGY LAHUG, CEBU CITY, CEBU 6000\nSEX: M",
    ),
  ).toMatchObject({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
    currentPostalCode: "6000",
    currentAddressLine1: "123 Rizal St",
  });
});
it("reads a rural address without inventing a street", () => {
  expect(
    extractIdAddress("TIRAHAN\nLIBORON, CATIGBIAN, BOHOL\nDATE OF BIRTH: 1990-01-01"),
  ).toMatchObject({
    currentProvince: "Bohol",
    currentCity: "Catigbian",
    currentBarangay: "Liboron",
  });
  expect(extractIdAddress("TIRAHAN\nLIBORON, CATIGBIAN, BOHOL")).not.toHaveProperty(
    "currentAddressLine1",
  );
});
it("ignores office locations and IDs with no readable address", () => {
  expect(
    extractIdAddress(
      "LAND TRANSPORTATION OFFICE\nQUEZON CITY\nTEST BUYER\nDATE OF BIRTH: 1990-01-01",
    ),
  ).toBeNull();
  expect(extractIdAddress("Address: unreadable")).toBeNull();
});
it("does not guess a province for ambiguous city names", () => {
  expect(extractIdAddress("ADDRESS: SAN JOSE")).toBeNull();
});

it("distinguishes Quezon City from the province of Quezon", () => {
  expect(extractIdAddress("ADDRESS: 10 RIZAL ROAD, QUEZON CITY")).toMatchObject({
    currentProvince: "Metro Manila",
    currentCity: "Quezon City",
  });
});
it("skips an employer's address and reads the residential address", () => {
  expect(
    extractIdAddress("OFFICE ADDRESS: QUEZON CITY\nHOME ADDRESS: BRGY LAHUG, CEBU CITY, CEBU"),
  ).toMatchObject({ currentProvince: "Cebu", currentCity: "Cebu City" });
});
it("does not mistake a postal code for the street", () => {
  expect(extractIdAddress("ADDRESS: CEBU CITY, CEBU 9999")).not.toHaveProperty(
    "currentAddressLine1",
  );
});
it("corrects joined and misspelled locality names to dropdown values", () => {
  expect(extractIdAddress("ADDRESS: 7 RIZAL ST, TAGUMPAV, BACO, RIENTAMNINDORO")).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentAddressLine1: "7 Rizal St",
  });
  expect(extractIdAddress("ADDRESS: 12 MAIN ST, LAHUG, CEBUCITY, CEBU")).toMatchObject({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
  });
});
it("does not infer a city from a barangay shared by several cities", () => {
  const result = extractIdAddress("ADDRESS: 7 RIZAL ST, TAGUMPAY, RIENTAMNINDORO");
  expect(result?.currentProvince).toBe("Oriental Mindoro");
  expect(result).not.toHaveProperty("currentCity");
  expect(result).not.toHaveProperty("currentBarangay");
});
it("keeps the street without trailing security-pattern OCR noise", () => {
  expect(
    extractIdAddress(
      "Address\nSITIO CONCEPCION, TAGUMPAY, BACO, %-\nORIENTAL MINDORO, 5201 Pp.\n\nyd Expiration Date Agency Code",
    ),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentPostalCode: "5201",
    currentAddressLine1: "Sitio Concepcion",
  });
});
it("reads a licence address with no commas, a short misread barangay and a sitio name", () => {
  expect(
    extractIdAddress("Address\nMAHOGANY BRCY BICA CALAPAN CITY ORIENTAL\nMINDORO\nLicense No."),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentBarangay: "Biga",
    currentAddressLine1: "Mahogany",
  });
});
it("does not correct a short barangay name without a barangay label", () => {
  expect(extractIdAddress("ADDRESS: BICA, CALAPAN CITY, ORIENTAL MINDORO")).not.toHaveProperty(
    "currentBarangay",
  );
});
it("matches a spelled-out saint name and keeps the sitio before an unlabelled barangay", () => {
  expect(
    extractIdAddress(
      "Address\nMAHOGANY SANTO NINO CALAPAN CITY ORIENTAL\nMINDORO\nLicense No. Expiration Date",
    ),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentBarangay: "Sto. Niño",
    currentAddressLine1: "Mahogany",
  });
  expect(extractIdAddress("Address\n% MAHOGANY SANTO NIÑO, CALAPAN CITY")).toMatchObject({
    currentBarangay: "Sto. Niño",
    currentAddressLine1: "Mahogany",
  });
});
it("reads the address line when the small label is unreadable", () => {
  expect(
    extractIdAddress(
      "REPUBLIKA NG PILIPINAS\nDELA CRUZ\nJUAN\nJANUARY 01, 1990\nowas Ad reese\n123 MABINI ST, SAN VICENTE WEST, CITY OF\nCALAPAN, ORIENTAL MINDORO",
    ),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentBarangay: "San Vicente West",
    currentAddressLine1: "123 Mabini St",
  });
});
it("reads PhilSys and misread labels, and Roman or Arabic barangay numbers", () => {
  expect(
    extractIdAddress("Tirahan/Address\nBLK 5 LOT 12, MAMBOG II, BACOOR CITY, CAVITE"),
  ).toMatchObject({ currentCity: "Bacoor City", currentBarangay: "Mambog 2" });
  expect(extractIdAddress("Addross\nPUROK 3, LAHUG, CEBU CITY, CEBU")).toMatchObject({
    currentBarangay: "Lahug",
    currentAddressLine1: "Purok 3",
  });
});
it("does not take an unlabelled city on its own or an e-mail address as the holder's address", () => {
  expect(extractIdAddress("JUAN DELA CRUZ\nQUEZON CITY\nDATE OF BIRTH 1990")).toBeNull();
  expect(extractIdAddress("E-MAIL ADDRESS: juan@example.invalid")).toBeNull();
});
it("leaves the address blank instead of filling the street with unreadable text", () => {
  expect(
    extractIdAddress("Tirahan/Address\nCONCEPCION TA | GUMPAY. BAC6 RENTAL MHOORO (@ 5"),
  ).toBeNull();
});
it("does not read a street named after a town as that town", () => {
  expect(extractIdAddress("ADDRESS: 5 MABINI ST., ZONE 3")).toBeNull();
});

// Expected names are checked against the place list first, so a data update that renames a
// place fails here rather than in the parser assertions.
const barangays = (city: string, province: string) =>
  barangaysForCity(getCityCodeByName(city, province)).map((row) => row.name);
const postal = (city: string, province: string) =>
  postalCodeForCity(getCityCodeByName(city, province));
it("uses place names that exist in the location data", () => {
  expect(barangays("Calapan City", "Oriental Mindoro")).toEqual(
    expect.arrayContaining(["Ibaba East", "Ibaba West"]),
  );
  // Ibaba is only in Calapan, so a missing city can be inferred from it.
  const ibabaTowns = citiesForProvince("Oriental Mindoro").filter((city) =>
    barangaysForCity(city.code).some((row) => /^Ibaba/.test(row.name)),
  );
  expect(ibabaTowns.map((city) => city.name)).toEqual(["Calapan City"]);
  expect(barangays("Puerto Princesa City", "Palawan")).toContain("San Pedro");
  expect(barangays("Quezon City", "Metro Manila")).toContain("Commonwealth");
  expect(barangays("Cebu City", "Cebu")).toContain("Lahug");
});

it("reads a national ID address with OCR junk and a barangay that may be East or West", () => {
  expect(
    parseIdAddressLine("hE | BONIFACIO ST ZONE 3. IBABA, CALAPAN CITY, ORIENTAL MINDORO"),
  ).toEqual({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentPostalCode: postal("Calapan City", "Oriental Mindoro"),
    currentAddressLine1: "Bonifacio St, Zone 3",
    currentCountry: "Philippines",
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
    confidence: {
      currentProvince: 100,
      currentCity: 100,
      currentPostalCode: 100,
      currentAddressLine1: 95,
    },
  });
});

it("infers the city from a barangay found in only one town of the province", () => {
  const found = parseIdAddressLine("hE | BONIFACIO ST ZONE 3. IBABA, ORIENTAL MINDORO");
  expect(found).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
    currentAddressLine1: "Bonifacio St, Zone 3",
  });
  expect(found?.confidence?.currentCity).toBeGreaterThanOrEqual(80);
  expect(found?.confidence?.currentCity).toBeLessThanOrEqual(90);
});

it("takes the city from elsewhere in the OCR text when the address block lacks it", () => {
  expect(
    extractIdAddress(
      "xY CITY OF CALAPAN\nTirahan/Address\nhE | BONIFACIO ST ZONE 3. IBABA,\nORIENTAL MINDORO",
    ),
  ).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
    currentAddressLine1: "Bonifacio St, Zone 3",
    confidence: { currentCity: 90 },
  });
});

it("fixes look-alike digits, spells out BRGY and matches a city written without CITY", () => {
  expect(
    parseIdAddressLine("123 RIZAL AVE, BRGY. SAN PEDR0, PUERTO PRINCESA, PALAWAN 5300"),
  ).toMatchObject({
    currentProvince: "Palawan",
    currentCity: "Puerto Princesa City",
    currentBarangay: "San Pedro",
    currentPostalCode: postal("Puerto Princesa City", "Palawan"),
    currentAddressLine1: "123 Rizal Ave",
    // PEDR0 was corrected, so the barangay asks for a check; the rest is exact.
    confidence: { currentProvince: 100, currentCity: 98, currentBarangay: 94 },
  });
});

it("reads Q.C. as Quezon City and keeps the block and lot in the street", () => {
  expect(
    parseIdAddressLine("BLK 4 LOT 12 MAHOGANY ST, COMMONWEALTH Q.C., METRO MANILA"),
  ).toMatchObject({
    currentProvince: "Metro Manila",
    currentCity: "Quezon City",
    currentBarangay: "Commonwealth",
    currentPostalCode: postal("Quezon City", "Metro Manila"),
    currentAddressLine1: "Blk 4 Lot 12 Mahogany St",
  });
});

it("infers the province from the city without matching CEBU twice", () => {
  const found = parseIdAddressLine("45 GORORDO AVE LAHUG CEBU CITY");
  expect(found).toMatchObject({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
    currentAddressLine1: "45 Gorordo Ave",
    confidence: { currentCity: 100, currentBarangay: 100 },
  });
  expect(found?.confidence?.currentProvince).toBeLessThanOrEqual(90);
});

it("suggests every barangay the text could mean instead of picking one", () => {
  const found = parseIdAddressLine("12 MAIN ST, SAN VICENTE, CALAPAN CITY, ORIENTAL MINDORO");
  expect(found?.barangaySuggestions).toEqual(
    barangays("Calapan City", "Oriental Mindoro").filter((name) => name.startsWith("San Vicente ")),
  );
  expect(found).not.toHaveProperty("currentBarangay");
  expect(found?.confidence).not.toHaveProperty("currentBarangay");
});

it("rates exact names as sure and corrected spellings as needing a check", () => {
  const found = parseIdAddressLine("7 RIZAL ST, TAGUMPAV, BACO, RIENTAMNINDORO");
  expect(found).toMatchObject({ currentCity: "Baco", currentBarangay: "Tagumpay" });
  expect(found?.confidence?.currentCity).toBeGreaterThanOrEqual(95);
  for (const field of ["currentProvince", "currentBarangay"] as const) {
    expect(found?.confidence?.[field]).toBeGreaterThanOrEqual(80);
    expect(found?.confidence?.[field]).toBeLessThanOrEqual(94);
  }
});

it("keeps the city's postal code over a conflicting ZIP and uses the ZIP only without a city", () => {
  const conflicting = parseIdAddressLine("123 RIZAL ST, LAHUG, CEBU CITY, CEBU 6999");
  expect(conflicting?.currentPostalCode).toBe(postal("Cebu City", "Cebu"));
  expect(conflicting?.confidence?.currentPostalCode).toBeLessThan(95);
  expect(parseIdAddressLine("123 RIZAL ST, CEBU 6999")).toMatchObject({
    currentProvince: "Cebu",
    currentPostalCode: "6999",
    confidence: { currentPostalCode: 80 },
  });
});

it("parses an address quickly enough to run in the browser", () => {
  const started = performance.now();
  parseIdAddressLine("hE | BONIFACIO ST ZONE 3. IBABA, ORIENTAL MINDORO");
  parseIdAddressLine("123 RIZAL ST, PANGASINAN");
  expect(performance.now() - started).toBeLessThan(200);
});
