/** The first free "P<n>" after the slots already taken, so P1, P2, … with gaps refilled last. */
export function nextParkingCode(taken: string[]): string {
  const used = new Set(taken);
  let index = taken.length + 1;
  while (used.has(`P${index}`)) index += 1;
  return `P${index}`;
}

/** Natural order, so P2 comes before P10. */
export function compareParkingCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** The floor choice for parking slots on no floor. */
export const NO_FLOOR = "none";
