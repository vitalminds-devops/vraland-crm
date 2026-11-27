"use client";

import { Input } from "@/components/ui/input";
import { floorSetupInput, type FloorSetupDraft } from "../lib/floor-setup-draft";
import { floorLabel } from "../lib/unit-codes";
import { floorCodes, floorLevels, type UnitIdentifier } from "../lib/unit-identifier";
import { floorSetupSchema } from "../schemas/floor-setup.schema";

/** Floors shown in the preview before it skips to the top floor. */
const PREVIEW_FLOORS = 3;

/** The property form's Floors section: which floors to build and how units are numbered. */
export function FloorSetupFields({
  value,
  onChange,
  disabled,
}: {
  value: FloorSetupDraft;
  onChange: (next: FloorSetupDraft) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof FloorSetupDraft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: event.target.value });
  const input = floorSetupInput(value);
  const checked = input ? floorSetupSchema.safeParse(input) : null;
  const error = checked && !checked.success ? checked.error.issues[0]?.message : null;
  const levels =
    input && checked?.success ? floorLevels(input.fromLevel, input.toLevel, input.skipFloors) : [];
  const numbering: UnitIdentifier = {
    style: value.style,
    unitsPerFloor: 0,
    endings: input?.endings ?? [],
    skipFloors: input?.skipFloors ?? [],
  };
  const sample = value.style === "custom" ? numbering.endings.length : 4;
  const shown =
    levels.length > PREVIEW_FLOORS + 1
      ? [...levels.slice(0, PREVIEW_FLOORS), null, levels[levels.length - 1]]
      : levels;
  const skipped = (input?.skipFloors ?? []).filter(
    (level) => level > (levels[0] ?? 0) && level < (levels.at(-1) ?? 0),
  );
  const field = "h-11 text-base tabular-nums shadow-none sm:h-10 sm:text-sm";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-[13px] leading-5 font-medium">
          Starting floor
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={value.fromLevel}
            onChange={set("fromLevel")}
            placeholder="e.g. 1"
            className={field}
            disabled={disabled}
          />
        </label>
        <label className="grid gap-2 text-[13px] leading-5 font-medium">
          Top floor
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={value.toLevel}
            onChange={set("toLevel")}
            placeholder="e.g. 12"
            className={field}
            disabled={disabled}
          />
        </label>
        <label className="col-span-2 grid gap-2 text-[13px] leading-5 font-medium sm:col-span-1">
          Skip floors
          <Input
            value={value.skip}
            onChange={set("skip")}
            placeholder="e.g. 4, 13, 14"
            className={field}
            disabled={disabled}
          />
          {/* Reads back what was typed, so "4 13" or "4,13" both show as two floors. */}
          <span className="text-[12px] leading-5 font-normal text-muted-foreground">
            {input?.skipFloors.length
              ? `Skipping ${input.skipFloors.map((level) => floorLabel(level).replace(" Floor", "")).join(", ")}`
              : "Separate floors with commas"}
          </span>
        </label>
      </div>

      {input && (
        <>
          {/* Unit identifiers and sections are chosen on the property's Design page. */}

          <section
            aria-label="Preview"
            className="overflow-hidden border-y border-border/60 bg-muted/15"
          >
            <h3 className="border-b border-border/40 bg-muted/20 px-3 py-2 text-[12px] leading-5 font-medium text-muted-foreground">
              {error
                ? "Preview"
                : `Preview · ${levels.length} ${levels.length === 1 ? "floor" : "floors"}`}
            </h3>
            {error ? (
              <p role="alert" className="px-3 py-3 text-[13px] leading-5 text-destructive">
                {error}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {shown.map((level) =>
                  level === null ? (
                    <li key="gap" className="px-3 py-1.5 text-xs text-muted-foreground">
                      …
                    </li>
                  ) : (
                    <li key={level} className="flex gap-3 px-3 py-2 text-[13px] leading-5">
                      <span className="w-20 shrink-0 text-muted-foreground">
                        {floorLabel(level)}
                      </span>
                      <span className="min-w-0 flex-1 font-medium tabular-nums break-words">
                        {floorCodes(numbering, level, sample).join("  ")}
                        {value.style !== "custom" && "  …"}
                      </span>
                    </li>
                  ),
                )}
                {skipped.length > 0 && (
                  <li className="px-3 py-1.5 text-xs text-muted-foreground">
                    Skipped: {skipped.map(floorLabel).join(", ")}
                  </li>
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
