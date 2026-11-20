import {
  allProvinces,
  barangaysForCity,
  COUNTRY_NAME,
  getCityCodeByName,
  postalCodeForCity,
} from "@/lib/location";
import {
  addressWord,
  barangayBase,
  cityRows,
  issuerLine,
  nextField,
  normalize,
  withoutStreetNames,
  placeSpellings,
  provinceAliases,
  type DetectedIdAddress,
} from "./id-address";
import { distance } from "./id-address-match";

/** A match must spell at least this much of a name right to count as evidence. */
const EVIDENCE = 0.6;
/** Cities need more: many barangays share a name, so a loose city match picks the wrong one. */
const CITY_EVIDENCE = 0.7;

/** A stretch of one to three words, spaces removed, and where it sits in the text. */
type Run = { text: string; start: number; end: number };
/** How well a name matched, which words it used, and how long the name is. */
type Match = { score: number; start: number; end: number; length: number };
const NO_MATCH: Match = { score: 0, start: -1, end: -1, length: 0 };
/** One match must be this sure of a real name: weak hits alone add up from noise too. */
const anchored = (match: Match) => match.score >= 0.85 && match.length >= 5;
const overlaps = (a: Match, b: Match) =>
  a.score > 0 && b.score > 0 && a.start <= b.end && b.start <= a.end;

/**
 * The address part of one OCR read: around its label when one was read, else every
 * non-issuer line. OCR layout can split a long address line and put its end ("\u2026CITY OF
 * CALAPAN") just before the label, or push it past a few lines of noise, so the window is wide.
 */
function addressText(text: string) {
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const keep = (line: string) => line.trim() && !issuerLine.test(line);
  const label = new RegExp(String.raw`\b${addressWord}`, "i").exec(plain);
  if (!label) return plain.split(/\r?\n/).filter(keep).join(" ");
  const before = plain.slice(0, label.index).split(/\r?\n/).filter(keep).slice(-2);
  const after = plain
    .slice(label.index + label[0].length)
    .split(/\r?\n/)
    .map((line) => line.split(nextField)[0])
    .filter(keep)
    .slice(0, 10);
  return [...before, ...after].join(" ");
}

/** Barangay names found in many towns ("Zone III", "Poblacion"): they can't tell towns apart. */
const genericBarangay = /^(?:ZONE|PUROK|POBLACION|POB|BARANGAY|BRGY|SITIO|DISTRICT)\b/;

/**
 * Runs of one to three words, so "TA | GUMPAY" can still read as TAGUMPAY. Each OCR read
 * repeats most of the text; only the first of equal runs is kept, as only it can score best.
 */
function wordRuns(text: string): Run[] {
  const words = withoutStreetNames(normalize(text)).split(" ").filter(Boolean);
  const runs: Run[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < words.length; start++)
    for (let count = 1; count <= 3 && start + count <= words.length; count++) {
      const run = words.slice(start, start + count).join("");
      if (run.length < 3 || seen.has(run)) continue;
      seen.add(run);
      runs.push({ text: run, start, end: start + count - 1 });
    }
  return runs;
}

/** Same length, and every difference is a digit where the name has a letter. */
const sameButDigits = (name: string, read: string) =>
  name.length === read.length &&
  [...read].every(
    (char, index) => char === name[index] || (/\d/.test(char) && /[A-Z]/.test(name[index])),
  );

/**
 * How closely some run of the text spells `name` (1 is exact), and which words it used.
 * Scores below `floor` are not needed, so those runs stop early.
 */
function similarity(name: string, runs: Run[], floor: number): Match {
  const compact = name.replaceAll(" ", "");
  if (compact.length < 4 || /^\d+$/.test(compact)) return NO_MATCH;
  const slack = Math.max(1, Math.round(compact.length * 0.35));
  let best = NO_MATCH;
  for (const run of runs) {
    if (Math.abs(run.text.length - compact.length) > slack) continue;
    const longest = Math.max(compact.length, run.text.length);
    // Only a run that can beat the best so far is worth spelling out in full.
    const edits = distance(
      compact,
      run.text,
      Math.floor((1 - Math.max(best.score, floor)) * longest + 1e-9),
    );
    const score = 1 - edits / longest;
    if (score < floor) continue;
    // Four letters are too easy to hit by chance: a short name must be spelled exactly,
    // except where OCR read a letter as a look-alike digit ("BAC6" for BACO).
    if (compact.length <= 4 && score < 1 && !sameButDigits(compact, run.text)) continue;
    if (score > best.score)
      best = { score, start: run.start, end: run.end, length: compact.length };
  }
  return best;
}

const bestOf = (names: string[], runs: Run[], floor = 0) =>
  names.reduce<Match>((best, name) => {
    const found = similarity(name, runs, floor);
    return found.score > best.score ? found : best;
  }, NO_MATCH);

/**
 * Best guess of the address from text too garbled to parse, using every OCR read at once:
 * each place name (province, city, barangay) is scored by how closely the text spells it,
 * and the province–city–barangay chain with the most combined evidence wins. Misspelled
 * matches that agree with each other ("BAC6" + "RENTAL MHOORO" + "TAGUMPAY") add up to a
 * confident answer. Two of the three must agree, each from different words of the text;
 * a near-tie between cities keeps only the province, or nothing.
 */
export function guessIdAddress(texts: string[]): DetectedIdAddress | null {
  const runs = wordRuns(texts.map(addressText).join(" "));
  if (!runs.length) return null;
  const provinceMatches = new Map(
    allProvinces.map((province) => [province.name, bestOf(provinceAliases(province.name), runs)]),
  );
  const candidates = cityRows
    .map((row) => {
      // OCR often drops "CITY", so the bare name counts too.
      const bare = row.aliases.map((alias) => alias.replace(/^CITY OF | CITY$/g, ""));
      const written = provinceMatches.get(row.province) ?? NO_MATCH;
      // Without its province in the text, a city below the evidence bar is dropped below.
      const floor = written.score >= EVIDENCE ? 0 : CITY_EVIDENCE;
      const city = bestOf([...new Set([...row.aliases, ...bare])], runs, floor);
      // "Quezon City" names the city, not Quezon province as well: one stretch is one piece.
      const province = overlaps(city, written) ? NO_MATCH : written;
      return { row, city, province };
    })
    .filter(
      (candidate) => candidate.city.score >= CITY_EVIDENCE || candidate.province.score >= EVIDENCE,
    )
    .sort((a, b) => b.city.score + b.province.score - (a.city.score + a.province.score))
    .slice(0, 60);
  const scored = candidates.map((candidate) => {
    const code = getCityCodeByName(candidate.row.city, candidate.row.province);
    const barangays = barangaysForCity(code)
      .map((barangay) => {
        const name = normalize(barangay.name).replace(/^(?:BARANGAY|BRGY) /, "");
        // Below 0.8 a barangay can be neither chosen nor suggested.
        const full = bestOf(placeSpellings(name), runs, 0.8);
        // "IBABA" may mean Ibaba East or West: it counts, but less than the full name.
        const base = barangayBase(name);
        const partial = base === name ? NO_MATCH : bestOf(placeSpellings(base), runs, 0.8 / 0.9);
        const found =
          partial.score * 0.9 > full.score ? { ...partial, score: partial.score * 0.9 } : full;
        const used = overlaps(found, candidate.city) || overlaps(found, candidate.province);
        return { name: barangay.name, ...(used ? NO_MATCH : found) };
      })
      .sort((a, b) => b.score - a.score);
    const [first] = barangays;
    // A wrong barangay is worse than a blank one: fill it only from a near-exact match, and
    // offer the choices when several are spelled almost alike (Ibaba East/West).
    const close =
      first && first.score >= 0.85
        ? barangays.filter((barangay) => first.score - barangay.score < 0.05)
        : [];
    const barangay = close.length === 1 ? first : null;
    const city = candidate.city.score >= CITY_EVIDENCE ? candidate.city.score : 0;
    const province = candidate.province.score >= EVIDENCE ? candidate.province.score : 0;
    // A generic barangay fills in once the town is known but is no evidence for the town.
    const telling = close[0] && !genericBarangay.test(normalize(close[0].name)) ? close[0] : null;
    const pieces = [city, province, telling?.score ?? 0].filter(Boolean).length;
    const total = city + 0.8 * province + 0.9 * (telling?.score ?? 0);
    const sure = [candidate.city, candidate.province, telling ?? NO_MATCH].some(anchored);
    const suggestions =
      close.length > 1
        ? close
            .slice(0, 6)
            .map((row) => row.name)
            .sort()
        : [];
    return { ...candidate, code, barangay, suggestions, pieces, total, sure };
  });
  const [best, runnerUp] = scored
    .filter((entry) => entry.pieces >= 2 && entry.sure)
    .sort((a, b) => b.total - a.total);
  if (!best) return null;
  // A guess is never sure enough to fill silently: 80–90 by how well each piece was spelled.
  const sureness = (score: number) => Math.max(80, Math.min(90, Math.round(score * 100)));
  const result: DetectedIdAddress = {
    currentProvince: best.row.province,
    currentCountry: COUNTRY_NAME,
    confidence: {
      currentProvince: sureness(best.province.score >= EVIDENCE ? best.province.score : 0.85),
    },
  };
  // A close second in another city leaves only the province both agree on.
  if (runnerUp && best.total - runnerUp.total < 0.15)
    return runnerUp.row.province === best.row.province ? result : null;
  const city = sureness(best.city.score >= CITY_EVIDENCE ? best.city.score : 0.8);
  result.currentCity = best.row.city;
  result.currentPostalCode = postalCodeForCity(best.code);
  result.confidence = { ...result.confidence, currentCity: city, currentPostalCode: city };
  if (best.barangay) {
    result.currentBarangay = best.barangay.name;
    result.confidence.currentBarangay = sureness(best.barangay.score);
  } else if (best.suggestions.length) result.barangaySuggestions = best.suggestions;
  return result;
}

/**
 * Fill what the parser could not read from the guess. A parse that already has a city and
 * barangay is kept as is; a guess for a different city only replaces a parse without one.
 */
export function completeWithGuess(
  found: DetectedIdAddress | null,
  texts: string[],
): DetectedIdAddress | null {
  if (found?.currentCity && found.currentBarangay) return found;
  const guess = guessIdAddress(texts);
  if (!guess) return found;
  if (!found?.currentCity) {
    const confidence = { ...guess.confidence };
    // A province the parser read itself keeps the parser's confidence.
    if (found?.currentProvince === guess.currentProvince)
      confidence.currentProvince = found?.confidence?.currentProvince ?? confidence.currentProvince;
    if (found?.currentAddressLine1)
      confidence.currentAddressLine1 = found.confidence?.currentAddressLine1;
    return {
      ...guess,
      ...(found?.currentAddressLine1 && { currentAddressLine1: found.currentAddressLine1 }),
      confidence,
    };
  }
  if (guess.currentCity !== found.currentCity) return found;
  const { barangaySuggestions: suggestions, ...rest } = found;
  // Another read may settle which of the suggested barangays it is.
  if (guess.currentBarangay && (!suggestions || suggestions.includes(guess.currentBarangay)))
    return {
      ...rest,
      currentBarangay: guess.currentBarangay,
      confidence: { ...found.confidence, currentBarangay: guess.confidence?.currentBarangay ?? 80 },
    };
  if (!suggestions && guess.barangaySuggestions)
    return { ...found, barangaySuggestions: guess.barangaySuggestions };
  return found;
}
