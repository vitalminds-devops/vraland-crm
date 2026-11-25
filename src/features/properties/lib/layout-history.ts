/** A value with its undo and redo steps. */
export type History<T> = { past: T[]; value: T; future: T[] };

const LIMIT = 100;

/** A new value; `merge` folds it into the last step, so a whole drag undoes at once. */
export function record<T>(history: History<T>, value: T, merge: boolean): History<T> {
  if (Object.is(value, history.value)) return history;
  return {
    past: merge ? history.past : [...history.past.slice(-LIMIT + 1), history.value],
    value,
    future: [],
  };
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    value: history.past[history.past.length - 1]!,
    future: [history.value, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.value],
    value: history.future[0]!,
    future: history.future.slice(1),
  };
}
