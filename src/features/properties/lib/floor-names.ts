/** Floor names typed with commas ("Ground, Mezzanine, Roof"): trimmed, blanks and repeats dropped. */
export function parseFloorNames(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(",")
    .map((name) => name.trim().slice(0, 50))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
