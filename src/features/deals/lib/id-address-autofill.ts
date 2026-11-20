import {
  allProvinces,
  barangaysForCity,
  citiesForProvince,
  getCityCodeByName,
  postalCodeForCity,
} from "@/lib/location";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

import type { DetectedIdAddress, IdAddressField } from "./id-address";

export type IdAddressReview = Partial<Record<IdAddressField, "check">>;
export type IdAddressHints = { review: IdAddressReview; barangaySuggestions: string[] };

export const noIdAddressHints: IdAddressHints = { review: {}, barangaySuggestions: [] };

/** Below this a read value is ignored; below `SILENT` it is filled but marked "Please check". */
const MIN_CONFIDENCE = 80;
const SILENT_CONFIDENCE = 95;
const localityFields = ["currentProvince", "currentCity", "currentBarangay"] as const;

/** Fields that reset when the user changes a field: children of a province or city follow it. */
const dependents: Record<IdAddressField, IdAddressField[]> = {
  currentProvince: ["currentProvince", "currentCity", "currentBarangay", "currentPostalCode"],
  currentCity: ["currentCity", "currentBarangay", "currentPostalCode"],
  currentBarangay: ["currentBarangay"],
  currentPostalCode: ["currentPostalCode"],
  currentAddressLine1: ["currentAddressLine1"],
};

const inCity = (barangay: string, province: string | null, city: string | null) =>
  barangaysForCity(getCityCodeByName(city, province)).some((row) => row.name === barangay);

/**
 * Puts an address read from an ID into the Address step. Fields the user edited by hand
 * (`edited`) are never touched. Without `beforeUpload` (an ID already on file) only empty
 * fields are filled; after a new upload, values unchanged since the pick are replaced and
 * stale ones cleared. If a kept province, city or barangay disagrees with the ID, nothing
 * changes: the ID names another place.
 */
export function applyIdAddress(
  current: OpportunityAddress,
  found: DetectedIdAddress,
  {
    beforeUpload,
    edited,
  }: { beforeUpload?: OpportunityAddress; edited: ReadonlySet<IdAddressField> },
): IdAddressHints & { address: OpportunityAddress } {
  const unchanged = { address: current, ...noIdAddressHints };
  const confidence = (field: IdAddressField) => found.confidence?.[field] ?? 100;
  const accepted = (field: IdAddressField) =>
    found[field] && confidence(field) >= MIN_CONFIDENCE ? found[field] : null;
  const keep = (field: IdAddressField) =>
    edited.has(field) ||
    (Boolean(current[field]) && (!beforeUpload || current[field] !== beforeUpload[field]));
  const take = (field: IdAddressField) => (keep(field) ? current[field] || null : accepted(field));

  if (
    localityFields.some(
      (field) =>
        keep(field) && current[field] && accepted(field) && current[field] !== accepted(field),
    ) ||
    (localityFields.some((field) => keep(field) && current[field]) &&
      !accepted("currentProvince") &&
      !accepted("currentCity"))
  )
    return unchanged;

  let province = take("currentProvince");
  if (province && !keep("currentProvince") && !allProvinces.some((row) => row.name === province))
    province = null;
  let city = take("currentCity");
  if (city && !keep("currentCity") && !citiesForProvince(province).some((row) => row.name === city))
    city = null;
  let barangay = take("currentBarangay");
  if (barangay && !keep("currentBarangay") && !inCity(barangay, province, city)) barangay = null;
  // A kept city or barangay that no longer fits the province or city means another place.
  if (
    (city && !citiesForProvince(province).some((row) => row.name === city)) ||
    (barangay && !inCity(barangay, province, city))
  )
    return unchanged;

  const cityPostal = postalCodeForCity(getCityCodeByName(city, province));
  const foundPostal =
    city === current.currentCity ? take("currentPostalCode") : accepted("currentPostalCode");
  const address: OpportunityAddress = {
    ...current,
    currentProvince: province,
    currentCity: city,
    currentBarangay: barangay,
    currentPostalCode: foundPostal || cityPostal || null,
    currentAddressLine1: take("currentAddressLine1"),
  };

  const review: IdAddressReview = {};
  for (const field of Object.keys(dependents) as IdAddressField[])
    if (
      !keep(field) &&
      address[field] &&
      address[field] === accepted(field) &&
      confidence(field) < SILENT_CONFIDENCE
    )
      review[field] = "check";
  const barangaySuggestions = address.currentBarangay
    ? []
    : (found.barangaySuggestions ?? []).filter((name) => inCity(name, province, city));
  return { address, review, barangaySuggestions };
}

/** After the user changes `field`, its mark and those of the fields that reset with it go. */
export function clearIdAddressHint(hints: IdAddressHints, field: IdAddressField): IdAddressHints {
  const review = { ...hints.review };
  for (const reset of dependents[field]) delete review[reset];
  const cityChanged = field === "currentProvince" || field === "currentCity";
  return { review, barangaySuggestions: cityChanged ? [] : hints.barangaySuggestions };
}
