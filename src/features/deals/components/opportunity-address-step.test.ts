import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

import { applyIdAddress } from "../lib/id-address-autofill";
import type { DetectedIdAddress } from "../lib/id-address";
import { OpportunityAddressStep } from "./opportunity-address-step";

const empty: OpportunityAddress = {
  currentProvince: null,
  currentCity: null,
  currentBarangay: null,
  currentPostalCode: null,
  currentAddressLine1: null,
  currentCountry: "Philippines",
};

function renderAfterScan(found: DetectedIdAddress) {
  const { address, ...hints } = applyIdAddress(empty, found, { edited: new Set() });
  return renderToStaticMarkup(
    createElement(OpportunityAddressStep, { address, hints, required: true, onChange: () => {} }),
  );
}

it("selects the autofilled city and barangay and asks to check doubtful reads", () => {
  const html = renderAfterScan({
    currentProvince: "Cebu",
    currentCity: "Cebu City",
    currentBarangay: "Lahug",
    currentAddressLine1: "123 RIZAL ST",
    confidence: { currentCity: 88 },
  });
  expect(html).toMatch(
    /<select[^>]*name="currentCity"[\s\S]*?<option[^>]*value="Cebu City" selected=""/,
  );
  expect(html).toMatch(
    /<select[^>]*name="currentBarangay"[\s\S]*?<option[^>]*value="Lahug" selected=""/,
  );
  expect(html.match(/Please check/g)).toHaveLength(1);
  const hintId = /<span id="([^"]+)"[^>]*>.*?Please check/.exec(html)?.[1];
  expect(html).toMatch(
    new RegExp(
      `aria-describedby="${hintId}"[^>]*name="currentCity"|name="currentCity"[^>]*aria-describedby="${hintId}"`,
    ),
  );
  expect(html).toContain('value="6000"');
});

it("offers barangay suggestions when the ID is ambiguous", () => {
  const html = renderAfterScan({
    currentProvince: "Oriental Mindoro",
    currentCity: "Calapan City",
    barangaySuggestions: ["Ibaba East", "Ibaba West"],
  });
  expect(html).toContain('aria-label="Suggested barangays"');
  expect(html).toMatch(/<button[^>]*type="button"[^>]*>Ibaba East<\/button>/);
  expect(html).toMatch(/<button[^>]*type="button"[^>]*>Ibaba West<\/button>/);
  expect(html).not.toContain("Please check");
});
