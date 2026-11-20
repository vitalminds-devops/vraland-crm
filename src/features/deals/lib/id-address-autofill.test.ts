import { describe, expect, it } from "vitest";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

import { applyIdAddress, clearIdAddressHint } from "./id-address-autofill";
import type { DetectedIdAddress, IdAddressField } from "./id-address";

const empty: OpportunityAddress = {
  currentProvince: null,
  currentCity: null,
  currentBarangay: null,
  currentPostalCode: null,
  currentAddressLine1: null,
  currentCountry: "Philippines",
};
const cebu: DetectedIdAddress = {
  currentProvince: "Cebu",
  currentCity: "Cebu City",
  currentBarangay: "Lahug",
  currentPostalCode: "6000",
  currentAddressLine1: "123 RIZAL ST",
};
const none = new Set<IdAddressField>();
const fill = (current: OpportunityAddress, found: DetectedIdAddress, edited = none) =>
  applyIdAddress(current, found, { edited });

describe("confidence", () => {
  it("fills 95+ silently, marks 80–94 to check and skips below 80", () => {
    const result = fill(empty, {
      ...cebu,
      confidence: {
        currentProvince: 99,
        currentCity: 95,
        currentBarangay: 85,
        currentAddressLine1: 79,
      },
    });
    expect(result.address).toMatchObject({
      currentProvince: "Cebu",
      currentCity: "Cebu City",
      currentBarangay: "Lahug",
      currentAddressLine1: null,
    });
    expect(result.review).toEqual({ currentBarangay: "check" });
  });
  it("treats a missing confidence as certain", () => {
    expect(fill(empty, cebu)).toMatchObject({ address: cebu, review: {} });
  });
  it("drops a city and barangay that rest on a doubtful province", () => {
    expect(fill(empty, { ...cebu, confidence: { currentProvince: 60 } }).address).toMatchObject({
      currentProvince: null,
      currentCity: null,
      currentBarangay: null,
    });
  });
});

describe("manual entries", () => {
  it("fills empty fields while preserving manual entries", () => {
    expect(
      fill({ ...empty, currentAddressLine1: "Manually entered street" }, cebu).address,
    ).toMatchObject({ currentCity: "Cebu City", currentAddressLine1: "Manually entered street" });
    expect(fill({ ...empty, currentProvince: "Bohol" }, cebu).address.currentCity).toBeNull();
    expect(
      fill(
        { ...empty, currentProvince: "Cebu", currentCity: "Cebu City", currentBarangay: "Banilad" },
        cebu,
      ).address.currentAddressLine1,
    ).toBeNull();
  });
  it("never overwrites a field edited by hand, even after a new upload", () => {
    const current = { ...empty, currentAddressLine1: "Typed street" };
    const result = applyIdAddress(current, cebu, {
      beforeUpload: current,
      edited: new Set(["currentAddressLine1"]),
    });
    expect(result.address).toMatchObject({
      currentCity: "Cebu City",
      currentAddressLine1: "Typed street",
    });
  });
  it("leaves a hand-picked province alone when the ID names another", () => {
    const current = { ...empty, currentProvince: "Bohol" };
    const result = applyIdAddress(current, cebu, {
      beforeUpload: empty,
      edited: new Set(["currentProvince"]),
    });
    expect(result).toEqual({ address: current, review: {}, barangaySuggestions: [] });
  });
  it("fills the city under a hand-picked province that matches", () => {
    const current = { ...empty, currentProvince: "Cebu" };
    expect(fill(current, cebu, new Set(["currentProvince"])).address.currentCity).toBe("Cebu City");
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
  const upload = (current: OpportunityAddress, found: DetectedIdAddress, edited = none) =>
    applyIdAddress(current, found, { beforeUpload: old, edited }).address;
  expect(upload(old, cebu)).toMatchObject(cebu);
  expect(upload(old, { currentProvince: "Bohol" })).toMatchObject({
    currentProvince: "Bohol",
    currentCity: null,
    currentBarangay: null,
    currentAddressLine1: null,
    currentPostalCode: null,
  });
  expect(
    upload(
      { ...old, currentAddressLine1: "Edited while scanning" },
      cebu,
      new Set(["currentAddressLine1"]),
    ),
  ).toMatchObject({ currentCity: "Cebu City", currentAddressLine1: "Edited while scanning" });
  const edited = { ...old, currentProvince: "Bohol", currentCity: null, currentBarangay: null };
  expect(upload(edited, cebu, new Set(["currentProvince"]))).toEqual(edited);
});

describe("consistency", () => {
  it("does not set a city outside the province or a barangay outside the city", () => {
    expect(fill(empty, { ...cebu, currentCity: "Tagbilaran City" }).address).toMatchObject({
      currentProvince: "Cebu",
      currentCity: null,
      currentBarangay: null,
    });
    expect(fill(empty, { ...cebu, currentBarangay: "Booy" }).address).toMatchObject({
      currentCity: "Cebu City",
      currentBarangay: null,
    });
  });
  it("fills the postal code from the city when the ID has none", () => {
    expect(fill(empty, { ...cebu, currentPostalCode: undefined }).address.currentPostalCode).toBe(
      "6000",
    );
  });
});

describe("barangay suggestions", () => {
  it("keeps only names in the chosen city", () => {
    const found = {
      currentProvince: "Oriental Mindoro",
      currentCity: "Calapan City",
      barangaySuggestions: ["Ibaba East", "Ibaba West", "Not A Barangay"],
    };
    expect(fill(empty, found).barangaySuggestions).toEqual(["Ibaba East", "Ibaba West"]);
  });
  it("go away when the user picks another city", () => {
    const hints = {
      review: { currentCity: "check" as const },
      barangaySuggestions: ["Ibaba East"],
    };
    expect(clearIdAddressHint(hints, "currentCity")).toEqual({
      review: {},
      barangaySuggestions: [],
    });
    expect(clearIdAddressHint(hints, "currentAddressLine1")).toEqual(hints);
  });
});

it("replaces the whole address when a new ID is picked after a barangay was chosen by hand", () => {
  // The first ID filled Calapan and the agent picked the barangay from its suggestions.
  const fromFirstId: OpportunityAddress = {
    ...empty,
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    currentBarangay: "Ibaba West",
    currentPostalCode: "5200",
    currentAddressLine1: "Bonifacio St, Zone 3",
  };
  const replace = (edited: Set<IdAddressField>) =>
    applyIdAddress(fromFirstId, cebu, { beforeUpload: fromFirstId, edited }).address;
  // Remembering that earlier pick blocked the new ID entirely; the dialog now forgets it on upload.
  expect(replace(new Set<IdAddressField>(["currentBarangay"]))).toEqual(fromFirstId);
  expect(replace(new Set<IdAddressField>())).toMatchObject({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
    currentPostalCode: "6000",
    currentAddressLine1: "123 RIZAL ST",
  });
});
