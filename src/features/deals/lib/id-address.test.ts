import { expect, it } from "vitest";
import { extractIdAddress, mergeIdAddress } from "./id-address";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

const empty: OpportunityAddress = {
  currentProvince: null,
  currentCity: null,
  currentBarangay: null,
  currentPostalCode: null,
  currentAddressLine1: null,
  currentCountry: "Philippines",
};
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
    currentAddressLine1: "123 RIZAL ST",
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
it("fills empty fields while preserving manual entries", () => {
  const found = extractIdAddress("ADDRESS: 123 RIZAL ST, BRGY LAHUG, CEBU CITY, CEBU 6000")!;
  expect(
    mergeIdAddress({ ...empty, currentAddressLine1: "Manually entered street" }, found),
  ).toMatchObject({ currentCity: "Cebu City", currentAddressLine1: "Manually entered street" });
  expect(mergeIdAddress({ ...empty, currentProvince: "Bohol" }, found).currentCity).toBeNull();
  expect(
    mergeIdAddress(
      { ...empty, currentProvince: "Cebu", currentCity: "Cebu City", currentBarangay: "Banilad" },
      found,
    ).currentAddressLine1,
  ).toBeNull();
});
it("corrects joined and misspelled locality names to dropdown values", () => {
  expect(extractIdAddress("ADDRESS: 7 RIZAL ST, TAGUMPAV, BACO, RIENTAMNINDORO")).toMatchObject({
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentAddressLine1: "7 RIZAL ST",
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
    currentAddressLine1: "SITIO CONCEPCION",
  });
});
it("replaces the previous ID address and clears stale fields after a new upload", () => {
  const old = {
    ...empty,
    currentProvince: "Oriental Mindoro",
    currentCity: "Baco",
    currentBarangay: "Tagumpay",
    currentAddressLine1: "Old OCR street",
    currentPostalCode: "5201",
  };
  const found = extractIdAddress("ADDRESS: 123 RIZAL ST, BRGY LAHUG, CEBU CITY, CEBU 6000")!;
  expect(mergeIdAddress(old, found, old)).toMatchObject({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
    currentAddressLine1: "123 RIZAL ST",
    currentPostalCode: "6000",
  });
  expect(mergeIdAddress(old, { currentProvince: "Bohol" }, old)).toMatchObject({
    currentProvince: "Bohol",
    currentCity: null,
    currentBarangay: null,
    currentAddressLine1: null,
    currentPostalCode: null,
  });
  expect(
    mergeIdAddress({ ...old, currentAddressLine1: "Edited while scanning" }, found, old),
  ).toMatchObject({ currentCity: "Cebu City", currentAddressLine1: "Edited while scanning" });
  const edited = { ...old, currentProvince: "Bohol", currentCity: null, currentBarangay: null };
  expect(mergeIdAddress(edited, found, old)).toEqual(edited);
});
