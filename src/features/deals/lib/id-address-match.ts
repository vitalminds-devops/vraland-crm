/** Edit distance, or `max + 1` as soon as it must be more than `max` (most pairs stop early). */
export function distance(left: string, right: string, max = Infinity) {
  if (Math.abs(left.length - right.length) > max) return max + 1;
  // Two reused rows: the guess runs this hundreds of thousands of times per ID.
  let previous = new Int32Array(right.length + 1);
  let current = new Int32Array(right.length + 1);
  for (let j = 0; j <= right.length; j++) previous[j] = j;
  for (let i = 0; i < left.length; i++) {
    current[0] = i + 1;
    let lowest = i + 1;
    for (let j = 0; j < right.length; j++) {
      const value = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + (left.charCodeAt(i) === right.charCodeAt(j) ? 0 : 1),
      );
      current[j + 1] = value;
      if (value < lowest) lowest = value;
    }
    if (lowest > max) return max + 1;
    [previous, current] = [current, previous];
  }
  return previous[right.length];
}

/**
 * One way to write a place, spaces removed. `name` is its full name, `short` a common short
 * form ("PUERTO PRINCESA", "QC"), `base` a barangay name without East/West that may mean either.
 */
export type PlaceKey<T> = { row: T; key: string; kind: "name" | "short" | "base" };
export type PlaceIndex<T> = { byKey: Map<string, PlaceKey<T>[]>; keys: PlaceKey<T>[] };

export function placeIndex<T>(keys: PlaceKey<T>[]): PlaceIndex<T> {
  const byKey = new Map<string, PlaceKey<T>[]>();
  for (const entry of keys) byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry]);
  return { byKey, keys };
}

/** Normalized words of the address; `locked` ones (street names, ZONE 3) never name a place. */
export type Word = { word: string; locked: boolean };
/** Where a place was read: rows that share the spelling, its words and how exact it was (0–1). */
export type PlaceHit<T> = {
  rows: T[];
  kind: PlaceKey<T>["kind"];
  start: number;
  end: number;
  score: number;
};

const MAX_WORDS = 6;

/**
 * The place written furthest right in words `from`..`to` (PH addresses run from street to
 * province, so the right end is read first); the longest spelling wins at one position. Without
 * an exact spelling, one misspelled by up to 20% is accepted when `fuzzyMinLength` allows it and
 * no other place is spelled almost as closely.
 */
export function findRightmost<T>(
  words: Word[],
  from: number,
  to: number,
  index: PlaceIndex<T>,
  fuzzyMinLength = 0,
  skip?: (start: number, end: number) => boolean,
): PlaceHit<T> | null {
  const windows: { start: number; end: number; text: string }[] = [];
  for (let end = to - 1; end >= from; end--) {
    let text = "";
    for (let start = end; start >= Math.max(from, end - MAX_WORDS + 1); start--) {
      if (words[start].locked) break;
      text = words[start].word + text;
      windows.push({ start, end, text });
    }
  }
  // Rightmost end first, then the longest window at that end.
  windows.sort((a, b) => b.end - a.end || a.start - b.start);
  for (const window of windows) {
    const found = index.byKey.get(window.text);
    if (!found || skip?.(window.start, window.end)) continue;
    const named = found.filter((entry) => entry.kind !== "base");
    const best = named.length ? named : found;
    return {
      rows: [...new Set(best.map((entry) => entry.row))],
      kind: best.some((entry) => entry.kind === "name") ? "name" : best[0].kind,
      start: window.start,
      end: window.end,
      score: 1,
    };
  }
  if (!fuzzyMinLength) return null;
  const scored: { row: T; score: number; start: number; end: number }[] = [];
  for (const entry of index.keys) {
    const { key } = entry;
    if (entry.kind === "base" || key.length < fuzzyMinLength || /\d/.test(key)) continue;
    const limit = Math.min(3, Math.round(key.length * 0.2));
    // One misread letter in a four-letter name scores 0.75.
    const minScore = Math.min(0.78, 1 - 1 / key.length);
    for (const window of windows) {
      if (window.end - window.start >= 4 || Math.abs(window.text.length - key.length) > limit)
        continue;
      if (skip?.(window.start, window.end)) continue;
      const edits = distance(key, window.text);
      const score = 1 - edits / Math.max(key.length, window.text.length);
      if (edits <= limit && score >= minScore)
        scored.push({ row: entry.row, score, start: window.start, end: window.end });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.end - a.end || a.start - b.start);
  const [best] = scored;
  if (!best) return null;
  // Close alternatives stay blank: a spelling correction must not choose a different place.
  if (scored.some((other) => other.row !== best.row && best.score - other.score < 0.08))
    return null;
  return { rows: [best.row], kind: "name", start: best.start, end: best.end, score: best.score };
}
