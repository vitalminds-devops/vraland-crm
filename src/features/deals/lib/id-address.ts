import {
  allProvinces,
  citiesForProvince,
  barangaysForCity,
  getCityCodeByName,
  postalCodeForCity,
  COUNTRY_NAME,
} from "@/lib/location";
import type { OpportunityAddress } from "@/features/contacts/schemas/opportunity-contact.schema";
import { addressWord, cleanAddressText, trimJunkLines } from "./id-address-clean";
import {
  findRightmost,
  placeIndex,
  type PlaceHit,
  type PlaceIndex,
  type PlaceKey,
  type Word,
} from "./id-address-match";

export { addressWord };

/** The address fields an ID can fill. */
export type IdAddressField =
  | "currentProvince"
  | "currentCity"
  | "currentBarangay"
  | "currentPostalCode"
  | "currentAddressLine1";

/**
 * What was read from an ID. `confidence` is 0–100 per filled field: 95+ is filled silently,
 * 80–94 is filled and marked "Please check", below 80 is not filled. `barangaySuggestions`
 * lists the candidates when the text names more than one (e.g. Ibaba East and Ibaba West).
 */
export type DetectedIdAddress = Partial<OpportunityAddress> & {
  confidence?: Partial<Record<IdAddressField, number>>;
  barangaySuggestions?: string[];
};
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const romanNumerals = ["I", "II", "III", "IV", "V"];
/**
 * IDs and the place list spell names differently: "Santo Niño" or "Sto. Niño",
 * "Mambog II" or "Mambog 2". Every spelling of one place matches it.
 */
export const placeSpellings = (value: string) =>
  [
    value,
    value.replace(/\bSTO\b/g, "SANTO").replace(/\bSTA\b/g, "SANTA"),
    value.replace(/\bSANTO\b/g, "STO").replace(/\bSANTA\b/g, "STA"),
  ]
    .flatMap((spelling) => {
      const numeral = /\b(I|II|III|IV|V|[1-5])$/.exec(spelling)?.[1];
      if (!numeral) return [spelling];
      const other = /\d/.test(numeral)
        ? romanNumerals[Number(numeral) - 1]
        : String(romanNumerals.indexOf(numeral) + 1);
      return [spelling, spelling.replace(/\S+$/, other)];
    })
    .filter((spelling, index, all) => all.indexOf(spelling) === index);
const cityNames = (name: string) => {
  const value = normalize(name);
  if (!/\bCITY\b/.test(value)) return placeSpellings(value);
  const base = value.replace(/^CITY OF /, "").replace(/ CITY$/, "");
  return [value, `${base} CITY`, `CITY OF ${base}`].flatMap(placeSpellings);
};
/**
 * Normalized text without street names: "BONIFACIO ST" names a street, not the town of
 * Bonifacio, and "RIZAL AVE" is not barangay Rizal.
 */
export const withoutStreetNames = (normalized: string) =>
  normalized
    .replace(
      /\b[A-Z0-9]+ (?:STREET|ST|ROAD|RD|AVENUE|AVE|BLVD|DRIVE|DR|EXTENSION|EXT|LANE|LN)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

export const cityRows = allProvinces.flatMap((province) =>
  citiesForProvince(province.name).map((city) => ({
    province: province.name,
    city: city.name,
    aliases: cityNames(city.name),
  })),
);

/** "Ibaba" on an ID may mean Ibaba East or Ibaba West. */
export const barangayBase = (name: string) =>
  name.replace(/ (?:EAST|WEST|NORTH|SOUTH|CENTRAL|PROPER)$/, "");

/** Labels that end an address on Philippine IDs (LTO, PhilSys, UMID, postal, voter's, TIN). */
export const nextField =
  /\b(?:DATE OF BIRTH|BIRTH ?DATE|PETSA|SEX|KASARIAN|GENDER|NATIONALITY|CITIZENSHIP|CIVIL STATUS|MARITAL|EXPIRY|EXPIRATION|VALID UNTIL|VALIDITY|DATE ISSUED|SIGNATURE|LAGDA|LICENSE NO|DL CODES|BLOOD TYPE|HEIGHT|WEIGHT|EYES|AGENCY CODE|CONDITIONS|CRN|TIN|PRECINCT|EMERGENCY|IN CASE OF)\b/i;
/** IDs shorten leading words: "OR. MINDORO", "OCC. MINDORO", "N. ECIJA", "MT. PROVINCE". */
export const provinceAliases = (name: string) => {
  if (name === "Metro Manila") return ["METRO MANILA", "NATIONAL CAPITAL REGION", "NCR"];
  const value = normalize(name);
  return [
    ...new Set([
      value,
      value
        .replace(/^ORIENTAL /, "OR ")
        .replace(/^OCCIDENTAL /, "OCC ")
        .replace(/^NUEVA /, "N ")
        .replace(/^MOUNTAIN /, "MT "),
    ]),
  ];
};

/** Lines naming the card's issuer, whose head-office city is not the holder's address. */
export const issuerLine =
  /\b(?:REPUBLI\w*|PILIPINAS|PHILIPPINES|DEPARTMENT|OFFICE|BUREAU|COMMISSION|CORPORATION|AUTHORITY|SYSTEM|AGENCY)\b/i;

const addressFields: IdAddressField[] = [
  "currentProvince",
  "currentCity",
  "currentBarangay",
  "currentPostalCode",
  "currentAddressLine1",
];
/** How many address fields a read filled; confidence and suggestions are not fields. */
export const filledFieldCount = (address: DetectedIdAddress | null | undefined) =>
  addressFields.filter((field) => address?.[field]).length;

/** Ignore issuer/head-office text: a labelled address wins; otherwise a line that reads as one. */
export function extractIdAddress(text: string): DetectedIdAddress | null {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const labels = plain.matchAll(new RegExp(String.raw`\b${addressWord}\s*[:.\-]?\s*`, "gi"));
  const label = [...labels].find(
    (match) =>
      !/\b(?:OFFICE|COMPANY|EMPLOYER|BUSINESS|ISSUING OFFICE|E-?MAIL)\s*$/i.test(
        plain.slice(plain.lastIndexOf("\n", match.index) + 1, match.index),
      ),
  );
  if (label) {
    const block = plain
      .slice(label.index + label[0].length)
      .split(nextField)[0]
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .slice(0, 6)
      .join("\n")
      .trim();
    // OCR layout can move a wrapped "CITY OF CALAPAN" away from the rest of the address.
    const elsewhere = plain
      .split(/\r?\n/)
      .filter((line) => !issuerLine.test(line))
      .join("\n");
    const labelled = parseAddress(block, elsewhere)?.address ?? null;
    if (labelled) return labelled;
  }
  // Small labels are often unreadable while the address itself is clear. Without a label,
  // a line (or two, when it wraps) must name a city and its barangay or written province.
  const lines = plain
    .split(/\r?\n/)
    .map((line) => line.split(nextField)[0].trim())
    .filter(Boolean);
  let best: DetectedIdAddress | null = null;
  for (let start = 0; start < lines.length; start++) {
    for (const size of [1, 2]) {
      const window = lines.slice(start, start + size);
      if (window.length < size || window.some((line) => issuerLine.test(line))) continue;
      const parsed = parseAddress(window.join("\n"));
      if (!parsed?.address.currentCity) continue;
      const { currentBarangay, barangaySuggestions } = parsed.address;
      if (!currentBarangay && !barangaySuggestions && !parsed.provinceWritten) continue;
      const fields = filledFieldCount(parsed.address) - filledFieldCount(best);
      // On a tie, the shorter street has not swallowed the name or birth date line above.
      const shorter =
        (parsed.address.currentAddressLine1?.length ?? 0) <
        (best?.currentAddressLine1?.length ?? Infinity);
      if (!best || fields > 0 || (fields === 0 && shorter)) best = parsed.address;
    }
  }
  return best;
}

/** One address written out without a label, e.g. "45 GORORDO AVE LAHUG CEBU CITY". */
export const parseIdAddressLine = (text: string) => parseAddress(text)?.address ?? null;

type CityRow = (typeof cityRows)[number];
type BarangayRow = ReturnType<typeof barangaysForCity>[number];
type Token = Word & { raw: string; segment: number; fixed: boolean };

const compact = (value: string) => value.replaceAll(" ", "");
const streetWord = /^(?:STREET|ST|ROAD|RD|AVENUE|AVE|BLVD|DRIVE|DR|EXTENSION|EXT|LANE|LN)$/;
/** These and the word after them are the house part: "ZONE 3", "SITIO CONCEPCION", "LOT 12". */
const streetPart = /^(?:ZONE|PUROK|SITIO|BLK|BLOCK|LOT|PHASE|NO)$/;
const streetHint =
  /\d|\b(?:STREET|ST|ROAD|RD|AVENUE|AVE|BLOCK|BLK|LOT|PUROK|SITIO|ZONE|SUBDIVISION|SUBD|VILLAGE)\b/i;
/** Common short names, matched like the full name. */
const cityShortNames: Record<string, string[]> = { "Quezon City": ["QC"], "Manila City": ["MLA"] };

const provinceIndex = placeIndex(
  allProvinces.flatMap((province) =>
    provinceAliases(province.name).map((alias) => ({
      row: province.name,
      key: compact(alias),
      kind: "name" as const,
    })),
  ),
);
/** Full names, then the name without CITY ("PUERTO PRINCESA") and short names as `short`. */
const cityKeys = (row: CityRow): PlaceKey<CityRow>[] => [
  ...row.aliases.map((alias) => ({ row, key: compact(alias), kind: "name" as const })),
  ...[
    ...row.aliases.map((alias) => alias.replace(/^CITY OF | CITY$/g, "")),
    ...(cityShortNames[row.city] ?? []),
  ]
    .filter((alias) => !row.aliases.includes(alias))
    .map((alias) => ({ row, key: compact(alias), kind: "short" as const })),
];
let allCities: PlaceIndex<CityRow> | undefined;
const provinceCities = new Map<string, PlaceIndex<CityRow>>();
const cityIndex = (province: string | undefined) => {
  if (!province) return (allCities ??= placeIndex(cityRows.flatMap(cityKeys)));
  let index = provinceCities.get(province);
  if (!index)
    provinceCities.set(
      province,
      (index = placeIndex(cityRows.filter((row) => row.province === province).flatMap(cityKeys))),
    );
  return index;
};
const cityBarangays = new Map<string, PlaceIndex<BarangayRow>>();
const barangayIndex = (code: string) => {
  let index = cityBarangays.get(code);
  if (index) return index;
  index = placeIndex(
    barangaysForCity(code).flatMap((row) => {
      const name = normalize(row.name).replace(/^(?:BARANGAY|BRGY) /, "");
      const base = barangayBase(name);
      return [
        ...placeSpellings(name).map((key) => ({ row, key: compact(key), kind: "name" as const })),
        ...(base !== name && base.length >= 4 ? placeSpellings(base) : []).map((key) => ({
          row,
          key: compact(key),
          kind: "base" as const,
        })),
      ];
    }),
  );
  cityBarangays.set(code, index);
  return index;
};

/** Words of the cleaned text with the comma- or line-separated part each belongs to. */
function tokenize(text: string): Token[] {
  const { text: cleaned, fixed } = cleanAddressText(text);
  const tokens = cleaned.split(/[,;\n]/).flatMap((segment, index) =>
    segment.split(/\s+/).flatMap((raw) =>
      normalize(raw)
        .split(" ")
        .filter(Boolean)
        .map((word, part) => ({
          word,
          raw: part ? "" : raw,
          segment: index,
          fixed: fixed.has(word),
          locked: false,
        })),
    ),
  );
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    // House numbers, street names ("BONIFACIO ST") and "ZONE 3" stay in the street.
    if (/^\d+$/.test(token.word) || streetWord.test(token.word)) token.locked = true;
    if (next && streetWord.test(next.word) && next.segment === token.segment) token.locked = true;
    if (streetPart.test(token.word)) {
      token.locked = true;
      if (next) next.locked = true;
    }
  });
  return tokens;
}

/** 100 for an exact name, 98 for a short name, 80–94 for a spelling OCR got wrong. */
const sureness = <T>(hit: PlaceHit<T>, tokens: Token[]) => {
  const value = hit.score === 1 ? (hit.kind === "short" ? 98 : 100) : Math.round(hit.score * 100);
  const corrected = hit.score < 1 || tokens.slice(hit.start, hit.end + 1).some((t) => t.fixed);
  return corrected ? Math.max(80, Math.min(94, value)) : value;
};

/** House, street and sitio, title-cased with a comma between their parts. */
function formatStreet(tokens: Token[]) {
  const parts: string[] = [];
  let segment = -1;
  for (const token of tokens) {
    if (!token.raw) continue;
    const zone = /^(?:ZONE|PUROK|SITIO)$/.test(token.word) && parts.at(-1);
    if (token.segment !== segment || zone) parts.push(token.raw);
    else parts[parts.length - 1] += ` ${token.raw}`;
    segment = token.segment;
  }
  return trimJunkLines(parts.join(", "))
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\p{L}+/gu, (word, offset: number, all: string) =>
      /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/.test(word)
        ? word
        : /^(?:ST|ND|RD|TH)$/i.test(word) && /\d$/.test(all.slice(0, offset))
          ? word.toLowerCase()
          : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    );
}

/**
 * Reads an address right to left, as Philippine addresses run from house to province: the
 * province first, then only that province's cities, then only that city's barangays. What is
 * left before them is the street. `elsewhere` is the rest of the OCR text, searched for the
 * city when the address itself lacks one.
 */
function parseAddress(
  text: string,
  elsewhere = "",
): { address: DetectedIdAddress; provinceWritten: boolean } | null {
  const tokens = tokenize(text);
  let end = tokens.length;
  while (end > 0 && /^(?:PHILIPPINES|PHL|PH|PILIPINAS)$/.test(tokens[end - 1].word)) end--;
  let zip = end > 0 && /^\d{4}$/.test(tokens[end - 1].word) ? end - 1 : -1;
  if (zip >= 0) end = zip;
  const label = tokens.findIndex((token, index) => index < end && token.word === "BARANGAY");
  if (label >= 0) {
    tokens[label].locked = true;
    // A labelled barangay may be a number or "Zone 3".
    for (let i = label + 1; i < end && tokens[i].segment === tokens[label].segment; i++)
      tokens[i].locked = streetWord.test(tokens[i].word);
  }
  const afterLabel = (start: number) => start === label + 1;
  const confidence: DetectedIdAddress["confidence"] = {};

  // "CEBU" in "CEBU CITY" and "CALAPAN" in "CITY OF CALAPAN" name the city, not a province.
  const province = findRightmost(
    tokens,
    0,
    end,
    provinceIndex,
    5,
    (start, last) =>
      afterLabel(start) ||
      tokens[last + 1]?.word === "CITY" ||
      (tokens[start - 1]?.word === "OF" && tokens[start - 2]?.word === "CITY"),
  );
  let provinceName = province?.rows[0];
  if (province) {
    confidence.currentProvince = sureness(province, tokens);
    if (zip < 0 && /^\d{4}$/.test(tokens[province.end + 1]?.word ?? "")) zip = province.end + 1;
  }
  const cityEnd = province ? province.start : end;
  let city: PlaceHit<CityRow> | null = findRightmost(
    tokens,
    0,
    cityEnd,
    cityIndex(provinceName),
    provinceName ? 5 : 0,
    afterLabel,
  );
  // "SAN JOSE" names a town in nine provinces.
  if (city && city.rows.length > 1) city = null;
  let cityRow = city?.rows[0];
  if (city && cityRow) {
    confidence.currentCity = sureness(city, tokens);
    if (!provinceName) {
      provinceName = cityRow.province;
      confidence.currentProvince = 90;
    }
  } else if (provinceName && elsewhere) {
    const other = tokenize(elsewhere);
    const found = findRightmost(other, 0, other.length, cityIndex(provinceName));
    if (found?.rows.length === 1) {
      cityRow = found.rows[0];
      confidence.currentCity = 90;
    }
  }

  let barangay: PlaceHit<BarangayRow> | null = null;
  const barangayEnd = city ? city.start : cityEnd;
  const labelEnd =
    label >= 0 ? tokens.findLastIndex((t) => t.segment === tokens[label].segment) + 1 : 0;
  const [from, to] =
    label >= 0 && label < barangayEnd
      ? [label + 1, Math.min(labelEnd, barangayEnd)]
      : [0, barangayEnd];
  if (cityRow) {
    const code = getCityCodeByName(cityRow.city, provinceName);
    barangay = code
      ? findRightmost(tokens, from, to, barangayIndex(code), label >= 0 ? 4 : 5)
      : null;
  } else if (provinceName) {
    // No city: a barangay found in only one of the province's towns names the town. Only the
    // part just before the province counts, so a name or street word elsewhere cannot decide it.
    const near = province
      ? tokens.findIndex((t) => t.segment >= tokens[province.start].segment - 1)
      : 0;
    const towns = cityRows.flatMap((row) => {
      if (row.province !== provinceName) return [];
      const code = getCityCodeByName(row.city, provinceName);
      const hit = code && findRightmost(tokens, Math.max(from, near), to, barangayIndex(code));
      return hit ? [{ row, hit }] : [];
    });
    if (towns.length === 1) {
      cityRow = towns[0].row;
      barangay = towns[0].hit;
      confidence.currentCity = 85;
    }
  }
  const result: DetectedIdAddress = {};
  if (provinceName) result.currentProvince = provinceName;
  if (cityRow) result.currentCity = cityRow.city;
  if (barangay && cityRow) {
    const names = barangay.rows.map((row) => row.name).sort();
    if (names.length > 1) result.barangaySuggestions = names;
    else {
      result.currentBarangay = names[0];
      const sure = barangay.kind === "base" ? 85 : sureness(barangay, tokens);
      confidence.currentBarangay = city ? sure : Math.min(90, sure);
    }
  }

  const postal = cityRow ? postalCodeForCity(getCityCodeByName(cityRow.city, provinceName)) : null;
  const written = zip >= 0 ? tokens[zip].word : null;
  if (postal) {
    result.currentPostalCode = postal;
    // A ZIP on the ID that disagrees with the city's is worth a second look.
    confidence.currentPostalCode = Math.min(
      confidence.currentCity ?? 100,
      written && written !== postal ? 90 : 100,
    );
  } else if (written) {
    result.currentPostalCode = written;
    confidence.currentPostalCode = 80;
  }

  const localityStart = Math.min(
    ...[
      barangay?.start,
      label >= 0 ? label : undefined,
      city?.start,
      province?.start,
      zip,
      end,
    ].filter((value): value is number => value !== undefined && value >= 0),
  );
  const streetTokens = tokens.slice(0, localityStart);
  const street = formatStreet(streetTokens);
  // Text before the barangay is the house, street or sitio, even without a street word.
  const beforeBarangay = Boolean(barangay) || (label >= 0 && label === localityStart);
  if (
    street.length > 3 &&
    street.length <= 255 &&
    /\p{L}{3}/u.test(street) &&
    (beforeBarangay || streetHint.test(street))
  ) {
    result.currentAddressLine1 = street;
    confidence.currentAddressLine1 = streetTokens.some((token) => token.fixed) ? 85 : 95;
  }
  // A street with no province or city is OCR noise, not an address worth filling in.
  if (!result.currentProvince && !result.currentCity) return null;
  result.currentCountry = COUNTRY_NAME;
  result.confidence = confidence;
  return { address: result, provinceWritten: Boolean(province) };
}
