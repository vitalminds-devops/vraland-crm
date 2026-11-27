import { expect, it } from "vitest";
import { matchesBoardSearch } from "./board-search";

const deal = {
  code: "OPP-0042",
  title: "Dela Cruz, Juan · Fairfield Heights",
  developmentName: "Fairfield Heights",
  propertyTitle: "Tower 2",
  unitCode: "5A",
  unitCodes: "5A, 5B",
  parkingCodes: "P12",
  contactFirstName: "Juan",
  contactMiddleName: null,
  contactLastName: "Dela Cruz",
  agentFirstName: "Maria",
  agentLastName: "Santos",
};

it("finds a card by its code, contact, unit, parking or agent, ignoring case", () => {
  for (const query of ["opp-0042", "dela cruz", "5b", "P12", "santos", "tower 2"])
    expect(matchesBoardSearch(deal, query)).toBe(true);
});

it("needs every word to match, and shows everything for a blank search", () => {
  expect(matchesBoardSearch(deal, "juan 5a")).toBe(true);
  expect(matchesBoardSearch(deal, "juan 7c")).toBe(false);
  expect(matchesBoardSearch(deal, "   ")).toBe(true);
});
