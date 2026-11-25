import type { FloorSetupInput } from "../schemas/floor-setup.schema";
import { parseEndings, parseFloorList, type UnitNumbering } from "./unit-numbering";

/** The Floors fields as typed. Leaving both floor fields blank builds no floors. */
export type FloorSetupDraft = {
  fromLevel: string;
  toLevel: string;
  skip: string;
  style: UnitNumbering["style"];
  endings: string;
};

export const emptyFloorSetup: FloorSetupDraft = {
  fromLevel: "",
  toLevel: "",
  skip: "",
  style: "number",
  endings: "01, 03, 05, 07, 09, 11, 15, 17",
};

/** What the action receives, or null when no floors are asked for. */
export function floorSetupInput(draft: FloorSetupDraft): FloorSetupInput | null {
  if (!draft.fromLevel.trim() && !draft.toLevel.trim()) return null;
  return {
    fromLevel: Number(draft.fromLevel),
    toLevel: Number(draft.toLevel),
    skipFloors: parseFloorList(draft.skip),
    style: draft.style,
    endings: parseEndings(draft.endings),
  };
}
