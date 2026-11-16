const trail: string[] = [];

/** Bounded so a long session cannot grow the array without limit. */
const LIMIT = 50;

/** Records that `pathname` is now on screen. A repeat is not a new entry. */
export function noteVisit(pathname: string) {
  if (trail[trail.length - 1] === pathname) return;
  trail.push(pathname);
  if (trail.length > LIMIT) trail.shift();
}

export function previousVisit(pathname: string): string | null {
  for (let index = trail.length - 1; index >= 0; index -= 1) {
    if (trail[index] !== pathname) return trail[index];
  }
  return null;
}
