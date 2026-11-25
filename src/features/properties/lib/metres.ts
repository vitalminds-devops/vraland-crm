/** A typed size while typing: the number when it's already in range, else null (keep typing). */
export function metresInRange(text: string, min: number, max: number): number | null {
  const typed = Number(text);
  return text.trim() !== "" && typed >= min && typed <= max ? typed : null;
}

/** A typed size on leaving the field: clamped into range, or null when it isn't a number. */
export function settleMetres(text: string, min: number, max: number): number | null {
  const typed = Number(text);
  return text.trim() !== "" && Number.isFinite(typed) ? Math.min(max, Math.max(min, typed)) : null;
}
