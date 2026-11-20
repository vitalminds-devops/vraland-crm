import {
  allProvinces,
  citiesForProvince,
  barangaysForCity,
  getCityCodeByName,
  postalCodeForCity,
  COUNTRY_NAME,
} from "@/lib/location";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";

export type DetectedIdAddress = Partial<OpportunityAddress>;
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const contains = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);
const cityNames = (name: string) => {
  const value = normalize(name);
  if (!/\bCITY\b/.test(value)) return [value];
  const base = value.replace(/^CITY OF /, "").replace(/ CITY$/, "");
  return [...new Set([value, `${base} CITY`, `CITY OF ${base}`])];
};
const cityRows = allProvinces.flatMap((province) =>
  citiesForProvince(province.name).map((city) => ({
    province: province.name,
    city: city.name,
    aliases: cityNames(city.name),
  })),
);

function distance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < right.length; j++)
      current.push(
        Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(left[i] !== right[j])),
      );
    previous = current;
  }
  return previous[right.length];
}

function match<T>(text: string, rows: T[], aliases: (row: T) => string[], fuzzy = false) {
  const matches = rows
    .flatMap((row) => {
      const names = aliases(row)
        .filter((alias) => contains(text, alias))
        .sort((a, b) => b.length - a.length);
      return names[0] ? [{ row, alias: names[0] }] : [];
    })
    .sort((a, b) => b.alias.length - a.alias.length);
  if (matches.length)
    return matches.length === 1 || matches[0].alias.length > matches[1].alias.length
      ? matches[0]
      : null;
  if (!fuzzy) return null;
  const words = text.split(" ");
  const candidates = rows
    .flatMap((row) => {
      let best: { row: T; alias: string; score: number } | undefined;
      for (const alias of aliases(row)) {
        const compact = alias.replaceAll(" ", "");
        if (compact.length < 5 || /\d/.test(compact)) continue;
        for (let start = 0; start < words.length; start++) {
          for (
            let count = 1;
            count <= alias.split(" ").length + 1 && start + count <= words.length;
            count++
          ) {
            const observed = words.slice(start, start + count).join(" ");
            const value = observed.replaceAll(" ", "");
            const limit = Math.min(3, Math.round(compact.length * 0.2));
            if (Math.abs(value.length - compact.length) > limit) continue;
            const edits = distance(compact, value);
            const score = 1 - edits / Math.max(compact.length, value.length);
            if (edits <= limit && score >= 0.78 && (!best || score > best.score))
              best = { row, alias: observed, score };
          }
        }
      }
      return best ? [best] : [];
    })
    .sort((a, b) => b.score - a.score);
  // Close alternatives stay blank: a spelling correction must not choose a different locality.
  return candidates.length &&
    (candidates.length === 1 || candidates[0].score - candidates[1].score >= 0.08)
    ? candidates[0]
    : null;
}

/** Ignore issuer/head-office text: only a labelled address can fill a client's address. */
export function extractIdAddress(text: string): DetectedIdAddress | null {
  const label = [...text.matchAll(/\b(?:ADDRESS|TIRAHAN)\b\s*[:/\-]?\s*/gi)].find(
    (match) =>
      !/\b(?:OFFICE|COMPANY|EMPLOYER|BUSINESS|ISSUING OFFICE)\s*$/i.test(
        text.slice(text.lastIndexOf("\n", match.index) + 1, match.index),
      ),
  );
  if (!label) return null;
  const block = text
    .slice(label.index + label[0].length)
    .split(
      /\b(?:DATE OF BIRTH|BIRTH ?DATE|SEX|GENDER|NATIONALITY|CITIZENSHIP|EXPIRY|EXPIRATION|VALID UNTIL|DATE ISSUED|SIGNATURE|LICENSE NO|DL CODES|BLOOD TYPE)\b/i,
    )[0]
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 6)
    .join("\n")
    .trim();
  const normalized = normalize(block);
  if (!normalized) return null;
  const provinceText = normalized.replace(/\b[A-Z]+ (?:STREET|ST|ROAD|RD|AVENUE|AVE|BLVD)\b/g, " ");
  const provinceMatches = allProvinces
    .flatMap((province) => {
      const aliases =
        province.name === "Metro Manila"
          ? ["METRO MANILA", "NATIONAL CAPITAL REGION", "NCR"]
          : [normalize(province.name)];
      return aliases
        .filter((alias) => contains(provinceText, alias))
        .map((alias) => ({ name: province.name, alias, position: normalized.lastIndexOf(alias) }));
    })
    .sort((a, b) => b.position - a.position || b.alias.length - a.alias.length);
  const fuzzyProvince = !provinceMatches.length
    ? match(provinceText, allProvinces, (row) => [normalize(row.name)], true)
    : null;
  let province = provinceMatches[0]?.name ?? fuzzyProvince?.row.name;
  const explicitCity = match(
    normalized,
    cityRows.filter((row) => row.aliases.some((alias) => alias.includes("CITY"))),
    (row) => row.aliases,
  );
  // "Quezon City" names a city in Metro Manila, not the province of Quezon.
  if (explicitCity && (!province || contains(explicitCity.alias, normalize(province))))
    province = explicitCity.row.province;
  const city = match(
    normalized,
    province ? cityRows.filter((row) => row.province === province) : cityRows,
    (row) => row.aliases,
    Boolean(province),
  );
  if (!province && city) province = city.row.province;
  const result: DetectedIdAddress = {};
  if (province) result.currentProvince = province;
  if (city) {
    result.currentCity = city.row.city;
    result.currentPostalCode = postalCodeForCity(getCityCodeByName(city.row.city, province));
  }
  const barangayRows = city ? barangaysForCity(getCityCodeByName(city.row.city, province)) : [];
  const barangayLabel = /\b(?:BRGY\.?|BARANGAY|BGY\.?)\s*[:.\-]?\s*/i.exec(block);
  const barangayText = normalize(
    barangayLabel
      ? block.slice(barangayLabel.index + barangayLabel[0].length).split(/[,\n]/)[0]
      : block,
  );
  const barangay = match(
    barangayText,
    barangayRows,
    (row) => {
      const name = normalize(row.name).replace(/^(?:BARANGAY|BRGY) /, "");
      return !barangayLabel && /^\d+$/.test(name) ? [] : [name];
    },
    true,
  );
  if (barangay) result.currentBarangay = barangay.row.name;

  let street = block;
  const localityNames = [
    provinceMatches.find((row) => row.name === province)?.alias,
    fuzzyProvince?.alias,
    city?.alias,
    barangay?.alias,
    result.currentPostalCode,
  ].filter((value): value is string => Boolean(value));
  const localityStart = Math.min(
    ...localityNames.map((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const position = block.search(new RegExp(`\\b${escaped}\\b`, "i"));
      return position < 0 ? block.length : position;
    }),
  );
  const prefix = block.slice(0, localityStart);
  if (/\b(?:STREET|ST|ROAD|RD|BLOCK|BLK|LOT|PUROK|SITIO|SUBDIVISION|SUBD|VILLAGE)\b/i.test(prefix))
    street = prefix;
  for (const name of localityNames.sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    street = street.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  street = street
    .replace(/\b(?:BRGY\.?|BARANGAY|BGY\.?)\b/gi, " ")
    .replace(/\bADDRESS\b\s*[:/\-]?/gi, " ")
    .replace(/[\s,;]+/g, " ")
    .replace(/^[ .:/\-]+|[ .:/\-]+$/g, "")
    .trim();
  if (
    street.length > 3 &&
    street.length <= 255 &&
    /[a-z]/i.test(street) &&
    /\d|\b(?:STREET|ST\.?|ROAD|RD\.?|BLOCK|BLK|LOT|PUROK|SITIO|SUBDIVISION|SUBD|VILLAGE)\b/i.test(
      street,
    )
  )
    result.currentAddressLine1 = street;
  if (!Object.keys(result).length) return null;
  result.currentCountry = COUNTRY_NAME;
  return result;
}

/** Replacement uploads refresh the address; edits made during recognition take precedence. */
export function mergeIdAddress(
  current: OpportunityAddress,
  found: DetectedIdAddress,
  beforeUpload?: OpportunityAddress,
): OpportunityAddress {
  if (beforeUpload) {
    if (
      current.currentProvince !== beforeUpload.currentProvince ||
      current.currentCity !== beforeUpload.currentCity ||
      current.currentBarangay !== beforeUpload.currentBarangay
    )
      return current;
    return {
      currentProvince: found.currentProvince ?? null,
      currentCity: found.currentCity ?? null,
      currentBarangay: found.currentBarangay ?? null,
      currentPostalCode:
        current.currentPostalCode !== beforeUpload.currentPostalCode
          ? current.currentPostalCode
          : (found.currentPostalCode ?? null),
      currentAddressLine1:
        current.currentAddressLine1 !== beforeUpload.currentAddressLine1
          ? current.currentAddressLine1
          : (found.currentAddressLine1 ?? null),
      currentCountry: COUNTRY_NAME,
    };
  }
  if (
    current.currentProvince &&
    found.currentProvince &&
    current.currentProvince !== found.currentProvince
  )
    return current;
  if (current.currentCity && found.currentCity && current.currentCity !== found.currentCity)
    return current;
  if (
    current.currentBarangay &&
    found.currentBarangay &&
    current.currentBarangay !== found.currentBarangay
  )
    return current;
  if (
    (current.currentProvince || current.currentCity) &&
    !found.currentProvince &&
    !found.currentCity
  )
    return current;
  return {
    ...current,
    currentProvince: current.currentProvince || found.currentProvince || null,
    currentCity: current.currentCity || found.currentCity || null,
    currentBarangay: current.currentBarangay || found.currentBarangay || null,
    currentPostalCode: current.currentPostalCode || found.currentPostalCode || null,
    currentAddressLine1: current.currentAddressLine1 || found.currentAddressLine1 || null,
    currentCountry: current.currentCountry || found.currentCountry || COUNTRY_NAME,
  };
}
