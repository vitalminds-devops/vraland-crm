import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { PropertyFloorUnitSelector } from "./property-floor-unit-selector";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  updates: [] as (() => void)[],
  rendering: false,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: () => {},
  useTransition: () => [false, () => {}],
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!(slot in hooks.states)) hooks.states[slot] = initial;
    return [
      hooks.states[slot],
      (next: unknown) => {
        // React may run queued updater functions while rendering the child.
        hooks.updates.push(() => {
          hooks.states[slot] = typeof next === "function" ? next(hooks.states[slot]) : next;
        });
      },
    ];
  },
}));

function button(
  node: ReactNode,
  predicate: (props: Record<string, unknown>) => boolean,
): { onClick: () => void; disabled?: boolean } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (child.type === "button" && predicate(child.props))
      return child.props as { onClick: () => void; disabled?: boolean };
    const match = button(child.props.children as ReactNode, predicate);
    if (match) return match;
  }
}

beforeEach(() => {
  hooks.states = [
    { key: "development", rows: [{ id: "building", title: "Tower", addressLine1: null }] },
    "building",
    { key: "building", rows: [{ id: "floor", level: 1, label: "Floor 1", imageUrl: null }] },
    "floor",
    {
      key: "floor",
      rows: [{ id: "unit", code: "1A", status: "available", imageStorageKey: null }],
      omitted: 0,
    },
    ["unit-on-another-floor"],
  ];
  hooks.cursor = 0;
  hooks.updates = [];
  hooks.rendering = false;
});

it("notifies the parent in the event, preserves other floors, and supports deselecting and clearing", () => {
  const onUnitsChange = vi.fn(() => expect(hooks.rendering).toBe(false));
  function render() {
    hooks.rendering = true;
    try {
      for (const update of hooks.updates.splice(0)) update();
      hooks.cursor = 0;
      return PropertyFloorUnitSelector({ developmentId: "development", onUnitsChange });
    } finally {
      hooks.rendering = false;
    }
  }

  let tree = render();
  expect(onUnitsChange).not.toHaveBeenCalled();
  button(tree, (props) => props["aria-checked"] === false)!.onClick();
  tree = render();
  expect(onUnitsChange).toHaveBeenLastCalledWith(["unit-on-another-floor", "unit"]);

  button(tree, (props) => props["aria-checked"] === true)!.onClick();
  tree = render();
  expect(onUnitsChange).toHaveBeenLastCalledWith(["unit-on-another-floor"]);

  button(tree, (props) => props.children === "Clear")!.onClick();
  tree = render();
  expect(onUnitsChange).toHaveBeenLastCalledWith([]);
  expect(onUnitsChange).toHaveBeenCalledTimes(3);
  expect(button(tree, (props) => props.children === "Clear")).toBeUndefined();
});

it("keeps compact unavailable unit choices disabled and existing selections removable", () => {
  hooks.states[4] = {
    key: "floor",
    rows: [
      { id: "sold", code: "1B", status: "sold", imageStorageKey: null },
      { id: "reserved", code: "1C", status: "deposit_paid", imageStorageKey: null },
      { id: "unit-on-another-floor", code: "1D", status: "sold", imageStorageKey: null },
    ],
    omitted: 0,
  };
  const tree = PropertyFloorUnitSelector({ developmentId: "development", onUnitsChange: vi.fn() });
  expect(button(tree, (props) => props["aria-label"] === "Unit 1B, Sold out")?.disabled).toBe(true);
  expect(button(tree, (props) => props["aria-label"] === "Unit 1C, Reserved")?.disabled).toBe(true);
  expect(button(tree, (props) => props["aria-label"] === "Unit 1D, Sold out")?.disabled).toBe(
    false,
  );
});
