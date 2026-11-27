"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { groupColors, groupHex, groupSides, sidesOverlap, type Section } from "../lib/sections";

/**
 * Sections: a name and colour for a set of floors (Tower A, floors 1–10), shown in that colour
 * on each of their units. A floor belongs to one group at most.
 */
export function SectionsField({
  floors,
  groups,
  onChange,
  disabled,
  unitEndings,
}: {
  floors: { id: string; label: string }[];
  groups: Section[];
  onChange: (next: Section[]) => void;
  disabled?: boolean;
  /** Every unit ending in the property (A, B… or 01, 02…), for sections that pick units. */
  unitEndings: string[];
}) {
  const update = (id: string, change: Partial<Section>) =>
    onChange(groups.map((group) => (group.id === id ? { ...group, ...change } : group)));
  // Another section holding this floor for the same units (odd, even or all) blocks it.
  const takenBy = (group: Section, floorId: string) =>
    groups.find(
      (other) =>
        other.id !== group.id && other.floorIds.includes(floorId) && sidesOverlap(other, group),
    );
  const add = () => {
    // Each new group takes the next colour, so groups differ at a glance.
    const color = groupColors[groups.length % groupColors.length].value;
    onChange([...groups, { id: crypto.randomUUID(), name: "", color, floorIds: [], side: "all" }]);
  };

  return (
    <fieldset aria-label="Sections" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Sections</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={add}
          disabled={disabled || !floors.length}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Add section
        </Button>
      </div>
      {!floors.length ? (
        <p className="text-[13px] text-muted-foreground">Add floors first.</p>
      ) : !groups.length ? (
        <p className="text-[13px] text-muted-foreground">No sections yet.</p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
          {groups.map((group, index) => {
            const hex = groupHex(group.color);
            return (
              <li key={group.id} className="space-y-3 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={group.name}
                    onChange={(event) => update(group.id, { name: event.target.value })}
                    placeholder="e.g. Tower A, Sunrise"
                    maxLength={40}
                    aria-label={`Section ${index + 1} name`}
                    className="flex-1 font-semibold"
                    style={{ color: hex }}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${group.name || `section ${index + 1}`}`}
                    onClick={() => onChange(groups.filter((other) => other.id !== group.id))}
                    disabled={disabled}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Section ${index + 1} colour`}
                  className="flex flex-wrap gap-1.5"
                >
                  {groupColors.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={group.color === option.value}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => update(group.id, { color: option.value })}
                      disabled={disabled}
                      className="grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-checked:ring-2 aria-checked:ring-foreground/40"
                      style={{ backgroundColor: option.hex }}
                    >
                      {group.color === option.value && (
                        <Check aria-hidden="true" className="size-3.5 text-white" />
                      )}
                    </button>
                  ))}
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Section ${index + 1} units`}
                  className="flex flex-wrap gap-1.5"
                >
                  {groupSides.map((option) => {
                    const checked = (group.side ?? "all") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        title={option.example || undefined}
                        onClick={() => update(group.id, { side: option.value })}
                        disabled={disabled}
                        className={cn(
                          "min-h-8 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                          checked
                            ? "border-foreground/30 bg-foreground/5 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {option.label}
                        {option.example && (
                          <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                            {option.example}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {group.side === "pick" &&
                  (unitEndings.length ? (
                    <div
                      className="flex flex-wrap gap-1.5"
                      aria-label={`Section ${index + 1} unit endings`}
                    >
                      {unitEndings.map((ending) => {
                        const on = (group.endings ?? []).includes(ending);
                        return (
                          <button
                            key={ending}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              update(group.id, {
                                endings: on
                                  ? (group.endings ?? []).filter((item) => item !== ending)
                                  : [...(group.endings ?? []), ending],
                              })
                            }
                            disabled={disabled}
                            className={cn(
                              "grid min-h-8 min-w-8 place-items-center rounded-md border px-2 text-xs font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                              on ? "text-white" : "border-border bg-background hover:bg-muted",
                            )}
                            style={on ? { backgroundColor: hex, borderColor: hex } : undefined}
                          >
                            {ending}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      Place units on a floor first.
                    </p>
                  ))}
                <div className="flex flex-wrap gap-1.5" aria-label={`Section ${index + 1} floors`}>
                  <button
                    type="button"
                    onClick={() =>
                      update(group.id, {
                        floorIds: floors
                          .filter((floor) => !takenBy(group, floor.id))
                          .map((floor) => floor.id),
                      })
                    }
                    disabled={disabled}
                    className="min-h-8 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                  >
                    All floors
                  </button>
                  {floors.map((floor) => {
                    const picked = group.floorIds.includes(floor.id);
                    const owner = takenBy(group, floor.id);
                    const taken = Boolean(owner && !picked);
                    return (
                      <button
                        key={floor.id}
                        type="button"
                        aria-pressed={picked}
                        title={taken ? `In ${owner?.name || "another section"}` : undefined}
                        disabled={disabled || taken}
                        onClick={() =>
                          update(group.id, {
                            floorIds: picked
                              ? group.floorIds.filter((id) => id !== floor.id)
                              : [...group.floorIds, floor.id],
                          })
                        }
                        className={cn(
                          "min-h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                          picked ? "text-white" : "border-border bg-background hover:bg-muted",
                        )}
                        style={picked ? { backgroundColor: hex, borderColor: hex } : undefined}
                      >
                        {floor.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
