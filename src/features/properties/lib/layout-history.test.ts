import { expect, it } from "vitest";
import { record, redo, undo } from "./layout-history";

it("undoes and redoes, folding merged changes into one step", () => {
  let history = { past: [] as number[], value: 0, future: [] as number[] };
  history = record(history, 1, false);
  history = record(history, 2, true); // same drag
  history = record(history, 3, false);
  history = undo(history);
  expect(history.value).toBe(2);
  history = undo(history);
  expect(history.value).toBe(0);
  expect(history.past).toEqual([]);
  history = redo(history);
  expect(history.value).toBe(2);
  history = record(history, 9, false);
  expect(history.future).toEqual([]);
});
