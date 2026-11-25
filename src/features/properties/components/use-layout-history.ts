"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { record, redo as redoStep, undo as undoStep, type History } from "../lib/layout-history";

/** Changes this close together count as one step, so a whole drag undoes at once. */
const BURST_MS = 400;

/**
 * A designer's pieces with undo and redo, like an editing app: Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y.
 * Shortcuts are ignored while typing in a field, and while `active` is off (another editor is open).
 */
export function useLayoutHistory<T>(initial: () => T, active = true) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    value: initial(),
    future: [],
  }));
  const lastChange = useRef(0);

  const set = useCallback((next: T | ((current: T) => T)) => {
    const now = Date.now();
    const merge = now - lastChange.current < BURST_MS;
    lastChange.current = now;
    setHistory((current) =>
      record(
        current,
        typeof next === "function" ? (next as (current: T) => T)(current.value) : next,
        merge,
      ),
    );
  }, []);
  const undo = useCallback(() => {
    lastChange.current = 0;
    setHistory(undoStep);
  }, []);
  const redo = useCallback(() => {
    lastChange.current = 0;
    setHistory(redoStep);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) undo();
      else if ((key === "z" && event.shiftKey) || key === "y") redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, active]);

  return {
    value: history.value,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
