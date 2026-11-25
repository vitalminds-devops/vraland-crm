import {
  type FloorLayout,
  type Rotation,
  type SpaceKind,
  type UnitDesign,
  fitPlacements,
  spaceLabels,
} from "./floor-layout";

/** Anything on Design floor's canvas: a unit, a parking slot or a shared space. */
export type Piece = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: Rotation;
  flip?: boolean;
  kind: SpaceKind | "unit" | "slot";
  typeId?: string;
  unitId?: string | null;
  slotId?: string | null;
  /** A name typed for this unit or slot; saved with the floor. */
  code?: string;
  /** A unit resized on the plan, away from its type's size. */
  sized?: boolean;
};

export const toPieces = (layout: FloorLayout): Piece[] => [
  ...layout.spaces,
  ...layout.units.map((unit) => ({ ...unit, kind: "unit" as const })),
  ...(layout.parking ?? []).map((slot) => ({ ...slot, kind: "slot" as const })),
];

/** The floor layout the pieces make, as it is saved. */
export function toLayout(
  size: { width: number; depth: number },
  pieces: readonly Piece[],
): FloorLayout {
  return {
    ...size,
    units: pieces.flatMap((piece) =>
      piece.kind === "unit"
        ? [
            {
              id: piece.id,
              x: piece.x,
              y: piece.y,
              w: piece.w,
              h: piece.h,
              rotation: piece.rotation,
              flip: piece.flip ?? false,
              typeId: piece.typeId!,
              unitId: piece.unitId ?? null,
              code: piece.code,
              sized: piece.sized,
            },
          ]
        : [],
    ),
    parking: pieces.flatMap(({ id, x, y, w, h, rotation, slotId, code, typeId, kind }) =>
      kind === "slot" ? [{ id, x, y, w, h, rotation, slotId: slotId ?? null, code, typeId }] : [],
    ),
    spaces: pieces.flatMap(({ id, x, y, w, h, rotation, kind }) =>
      kind === "unit" || kind === "slot" ? [] : [{ id, kind, x, y, w, h, rotation }],
    ),
  };
}

/** A unit pulled away from its type's size keeps it; pulled back, it follows its type again. */
export function markSized(piece: Piece, design: UnitDesign | null | undefined): Piece {
  if (piece.kind !== "unit" || !design) return piece;
  const sized = piece.w !== design.width || piece.h !== design.depth;
  return sized === Boolean(piece.sized) ? piece : { ...piece, sized: sized || undefined };
}

/** Units of a type take its new size after the type is redesigned, unless resized on the plan. */
export function refitType(
  pieces: readonly Piece[],
  typeId: string,
  design: UnitDesign,
  size: { width: number; depth: number },
): Piece[] {
  const fitted = fitPlacements(toLayout(size, pieces), { [typeId]: design });
  const byId = new Map(fitted.units.map((unit) => [unit.id, unit]));
  return pieces.map((piece) => {
    const unit = piece.kind === "unit" && piece.typeId === typeId ? byId.get(piece.id) : undefined;
    return unit ? { ...piece, x: unit.x, y: unit.y, w: unit.w, h: unit.h } : piece;
  });
}

/** What a piece is called in the layers list and the properties panel: "Unit 1A", "Hallway". */
export function pieceName(piece: Piece, code: string | undefined): string {
  if (piece.kind === "unit") return `Unit ${code ?? ""}`.trim();
  if (piece.kind === "slot") return `Parking ${code ?? ""}`.trim();
  return spaceLabels[piece.kind];
}
