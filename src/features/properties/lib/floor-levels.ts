const skippedFloorLevels: readonly number[] = [4];

/** Whether a level is one that is never built. */
function isSkippedFloorLevel(level: number): boolean {
  return skippedFloorLevels.includes(level);
}

/** The level a newly added floor takes: one above the top floor, skipping levels never built. */
export function nextFloorLevel(existing: readonly number[]): number {
  let level = existing.length ? Math.max(...existing) + 1 : 1;
  while (isSkippedFloorLevel(level)) level += 1;
  return level;
}

export function floorLevelSequence(floorCount: number): number[] {
  const levels: number[] = [];
  for (let level = 1; levels.length < floorCount; level += 1) {
    if (!isSkippedFloorLevel(level)) levels.push(level);
  }
  return levels;
}
