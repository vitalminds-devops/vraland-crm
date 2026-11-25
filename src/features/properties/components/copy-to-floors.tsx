"use client";

import { PanelSection } from "./geometry-fields";

/** The other floors that get the same layout when this floor is saved. */
export function CopyToFloors({
  floors,
  picked,
  onChange,
}: {
  floors: { id: string; label: string }[];
  picked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (!floors.length) return null;
  const all = picked.size === floors.length;
  return (
    <PanelSection>
      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold text-muted-foreground">
          Same layout on
          <button
            type="button"
            className="rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-muted"
            onClick={() => onChange(all ? new Set() : new Set(floors.map((floor) => floor.id)))}
          >
            {all ? "Clear" : "All floors"}
          </button>
        </legend>
        <div className="grid max-h-48 grid-cols-2 gap-0.5 overflow-y-auto">
          {floors.map((floor) => (
            <label
              key={floor.id}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={picked.has(floor.id)}
                onChange={() => {
                  const next = new Set(picked);
                  if (next.has(floor.id)) next.delete(floor.id);
                  else next.add(floor.id);
                  onChange(next);
                }}
                className="size-4 accent-primary"
              />
              <span className="truncate">{floor.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </PanelSection>
  );
}
