/** "Address" and its OCR misreads (Adress, Addross, Addres5); PhilSys prints "Tirahan/Address". */
export const addressWord = String.raw`(?:ADD?R[EAO]S[S5]?|TIRAHAN)\b(?:\s*/\s*ADD?R[EAO]S[S5]?\b)?`;

/** Abbreviations whose dot is part of the word, not a break: "ST.", "BLK.", "Q.C.", "ZONE. 3". */
const abbreviationDot =
  /\b(ST|STS|AVE|RD|BLVD|DR|EXT|BLK|BLDG|LOT|NO|ZONE|PUROK|PHASE|SUBD|VILL|MT|OR|OCC|GEN|JR|SR|[A-Z])\./gi;
const lookAlike: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B" };

/**
 * Security-print specks read as short junk at the ends of a line: "hE", "l", "I|", "%-", "Pp.".
 * Mixed or lower case counts as junk only in upper-case text, so a typed "Rizal St" keeps "St".
 */
function trimJunk(tokens: string[], upper: boolean) {
  const junk = (token: string) => {
    const core = token.replace(/[^A-Za-z0-9#]/g, "");
    if (!core) return !/^[,.]$/.test(token);
    if (core.length > 2) return false;
    return /[^A-Za-z0-9#.,'-]/.test(token) || (upper && /[a-z]/.test(core));
  };
  while (tokens.length && junk(tokens[0])) tokens.shift();
  while (tokens.length && junk(tokens.at(-1)!)) tokens.pop();
  return tokens;
}

/** Trims junk from both ends of every line of `text`. */
export function trimJunkLines(text: string) {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length >= letters.length * 0.7;
  return text
    .split(/\r?\n/)
    .map((line) => trimJunk(line.split(/\s+/).filter(Boolean), upper).join(" "))
    .join("\n");
}

/**
 * OCR text of an address, cleaned before it is matched: label remnants, pipes and edge junk
 * removed, look-alike digits inside words read as letters ("SAN PEDR0", "8ACO"), BRGY/STO/STA/POB
 * spelled out, and a dot between words read as a comma. Pure numbers (house, zone, ZIP) are
 * never changed. `fixed` lists the words whose digits were read as letters.
 */
export function cleanAddressText(text: string) {
  const fixed = new Set<string>();
  const cleaned = trimJunkLines(
    trimJunkLines(text.replace(new RegExp(String.raw`\b${addressWord}\s*[:.\-]?`, "gi"), " "))
      // OCR reads security-print lines as pipes and underscores ("ST_ZONE").
      .replace(/[|_]/g, " ")
      .replace(/[A-Za-z0-9]+/g, (word) => {
        const letters = word.replace(/[^A-Za-z]/g, "").length;
        const digits = word.length - letters;
        if (
          !digits ||
          letters < 2 ||
          letters <= digits ||
          /[^0158A-Za-z]/.test(word) ||
          /^\d+(?:ST|ND|RD|TH)$/i.test(word)
        )
          return word;
        const letter = word.replace(/[0158]/g, (digit) => lookAlike[digit]);
        fixed.add(letter.toUpperCase());
        return letter;
      })
      // OCR often reads the G of BRGY as C or 6.
      .replace(/\b(?:BARANGAY|[B8]R[GC6]Y|BGY)\b\.?/gi, "BARANGAY ")
      .replace(/\bSTO\b\.?/gi, "SANTO ")
      .replace(/\bSTA\b\.?/gi, "SANTA ")
      .replace(/\bPOB\b\.?/gi, "POBLACION ")
      .replace(abbreviationDot, "$1")
      .replace(/\.+(?=\s|$)/g, ","),
  )
    .split("\n")
    .map((line) =>
      line
        .replace(/\s*[,;](?:[\s,;.]*[,;])?\s*/g, ", ")
        .replace(/[ \t]+/g, " ")
        .replace(/^[\s,]+|[\s,]+$/g, ""),
    )
    .filter(Boolean)
    .join("\n");
  return { text: cleaned, fixed };
}
