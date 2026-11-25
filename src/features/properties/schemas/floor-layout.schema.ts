import { z } from "zod";
import {
  MAX_CANVAS,
  MAX_PIECES,
  MIN_PIECE,
  OVERHANG,
  footprint,
  overlaps,
  roomKinds,
  roomMargin,
  spaceKinds,
} from "../lib/floor-layout";

const optionalNumber = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
    z.number().min(0, "Use 0 or more.").max(max).nullable(),
  );

const metres = z.number().min(MIN_PIECE).max(MAX_CANVAS);
const item = {
  id: z.string().min(1).max(40),
  x: z.number().min(0).max(MAX_CANVAS),
  y: z.number().min(0).max(MAX_CANVAS),
  w: metres,
  h: metres,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
};

/** Every piece must sit inside its canvas. */
const inside = (
  canvas: { width: number; depth: number },
  pieces: readonly { x: number; y: number; w: number; h: number; rotation: 0 | 90 | 180 | 270 }[],
) =>
  pieces.every((piece) => {
    const [fw, fh] = footprint(piece);
    return piece.x + fw <= canvas.width + 0.001 && piece.y + fh <= canvas.depth + 0.001;
  });

/** Every room inside the unit's walls, except balconies, which may reach `OVERHANG` past them. */
function insideUnit(design: {
  width: number;
  depth: number;
  rooms: readonly {
    kind: (typeof roomKinds)[number];
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: 0 | 90 | 180 | 270;
  }[];
}) {
  return design.rooms.every((room) => {
    const margin = roomMargin(room.kind) + 0.001;
    const [fw, fh] = footprint(room);
    return (
      room.x >= -margin &&
      room.y >= -margin &&
      room.x + fw <= design.width + margin &&
      room.y + fh <= design.depth + margin
    );
  });
}

export const unitDesignSchema = z
  .object({
    width: z.number().min(2).max(60),
    depth: z.number().min(2).max(60),
    rooms: z
      .array(
        z.object({
          ...item,
          // Balconies may start outside the walls; `insideUnit` holds every other room in.
          x: z.number().min(-OVERHANG).max(MAX_CANVAS),
          y: z.number().min(-OVERHANG).max(MAX_CANVAS),
          kind: z.enum(roomKinds),
        }),
      )
      .max(MAX_PIECES),
  })
  .refine(insideUnit, "Keep every room inside the unit; only a balcony may stick out.");

/** A unit type: its name, price and design; its size and bedrooms come from the design. */
export const unitTypeSchema = z.object({
  propertyId: z.uuid(),
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Enter a name.").max(60, "Keep the name under 60 characters."),
  price: optionalNumber(10_000_000_000),
  reservationFee: optionalNumber(10_000_000_000),
  monthlyAmortization: optionalNumber(10_000_000_000),
  layout: unitDesignSchema,
});

export type UnitTypeInput = z.input<typeof unitTypeSchema>;

/** One unit's type and its own size and price; blank size or price uses its type's. */
export const unitDetailsSchema = z.object({
  unitId: z.uuid(),
  unitTypeId: z.preprocess((value) => (value === "" ? null : value), z.uuid().nullable()),
  floorArea: optionalNumber(100_000),
  price: optionalNumber(10_000_000_000),
});

/** A name typed for a unit or slot on the plan; blank keeps the one it has. */
const placedCode = z
  .string()
  .trim()
  .max(50, "Keep names under 50 characters.")
  .optional()
  .transform((value) => value || undefined);

export const floorLayoutSchema = z
  .object({
    width: z.number().min(4).max(MAX_CANVAS),
    depth: z.number().min(4).max(MAX_CANVAS),
    units: z
      .array(
        z.object({
          ...item,
          typeId: z.uuid(),
          unitId: z.uuid().nullable(),
          flip: z.boolean(),
          code: placedCode,
        }),
      )
      .max(MAX_PIECES),
    spaces: z.array(z.object({ ...item, kind: z.enum(spaceKinds) })).max(MAX_PIECES),
    parking: z
      .array(
        z.object({
          ...item,
          slotId: z.uuid().nullable(),
          code: placedCode,
          typeId: z.string().min(1).max(40).optional(),
        }),
      )
      .max(MAX_PIECES)
      .default([]),
  })
  .refine(
    (layout) => inside(layout, [...layout.units, ...layout.spaces, ...layout.parking]),
    "Keep everything inside the floor.",
  )
  // A car needs its whole bay: a slot may sit on a drive path, but not on a unit, another slot,
  // a wall-like space or a pillar.
  .refine(
    (layout) =>
      layout.parking.every(
        (slot, index) =>
          !layout.parking.some((other, at) => at !== index && overlaps(slot, other)) &&
          !layout.units.some((unit) => overlaps(slot, unit)) &&
          !layout.spaces.some((space) => space.kind !== "driveway" && overlaps(slot, space)),
      ),
    "Move the parking slots marked in red so they don't overlap.",
  )
  .refine((layout) => {
    const ids = layout.parking.flatMap((slot) => (slot.slotId ? [slot.slotId] : []));
    return new Set(ids).size === ids.length;
  }, "A parking slot is placed twice.")
  .refine(
    (layout) =>
      new Set(layout.units.flatMap((unit) => (unit.unitId ? [unit.unitId] : []))).size ===
      layout.units.filter((unit) => unit.unitId).length,
    "A unit is placed twice.",
  );

export const saveFloorLayoutSchema = z.object({
  floorId: z.uuid(),
  layout: floorLayoutSchema,
  /** Other floors that get the same layout. */
  copyToFloorIds: z.array(z.uuid()).max(200).default([]),
});
