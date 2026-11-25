"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoundedBox } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace } from "three";
import {
  footprint,
  isDoor,
  type FloorLayout,
  type FloorSpace,
  type RoomKind,
  type UnitDesign,
  type UnitPlacement,
} from "../lib/floor-layout";
import type { Surroundings as SurroundingsKind } from "../lib/surroundings";
import { RoomFloor, RoomName, UnitFloor } from "./game-look";
import { DrivingIn, ParkedCar, ParkingBayModel, PieceModel } from "./parking-scene";
import { FloorMenu } from "./floor-menu";
import { Surroundings } from "./surroundings";
import { ParkingChip, SelectedOutline, UnitChip, ZoomWatch } from "./unit-markers";
import {
  Bathroom,
  Bed,
  Box,
  Desk,
  Kitchen,
  Plant,
  SceneFrame,
  UnitPlaque,
  type SceneUnit,
} from "./floor-scene-kit";
import type { UnitGroup } from "../lib/floor-groups";

const WALL = "#e4ebf2";
const CAP = "#3d5468";

/**
 * A designed floor in the illustrated 3D style: every placed unit is built from its type's rooms
 * with real furniture, walls and a status line along its front (the design's bottom edge).
 */
export default function DesignedFloorScene({
  layout,
  units,
  designs,
  selectedUnitId,
  onSelect,
  onFallback,
  surroundings = "city",
  parking = [],
  selectedSlotId = null,
  onSelectSlot,
  children,
  extraActions,
  floorKey,
  floors = [],
  onFloorChange,
  alwaysShowFloorSwitch = false,
  canRenameFloors = false,
  propertyId = "",
}: {
  layout: FloorLayout;
  /** Units the viewer may see; others show as plain blocks. */
  units: SceneUnit[];
  designs: ReadonlyMap<string, UnitDesign>;
  selectedUnitId: string | null;
  /** Picking a unit; left out on the Design page, where the view is only a preview. */
  onSelect?: (id: string) => void;
  onFallback: () => void;
  /** What is drawn around the building, from the property type. */
  surroundings?: SurroundingsKind;
  /** The floor's parking slots, for their numbers and whether a car is parked. */
  parking?: { id: string; code: string; status: string }[];
  /** The parking slot whose panel is open, and picking one; slots are clicked like units. */
  selectedSlotId?: string | null;
  onSelectSlot?: (id: string) => void;
  children: ReactNode;
  /** More buttons in the view's toolbar, beside Hide labels, such as View photos. */
  extraActions?: ReactNode;
  /** The floor shown; switching it refits the camera while the 3D canvas stays alive. */
  floorKey?: string;
  /** Every floor, for the switcher shown in full screen, where the floor list is hidden. */
  floors?: { id: string; label: string; unitCount?: number; sections?: UnitGroup[] }[];
  onFloorChange?: (id: string) => void;
  /** Show the floor switcher outside full screen too, when there is no floor list beside it. */
  alwaysShowFloorSwitch?: boolean;
  /** Show renaming and adding floors in the floor menu. */
  canRenameFloors?: boolean;
  propertyId?: string;
}) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const slotById = new Map(parking.map((slot) => [slot.id, slot]));
  // The camera frames what is placed, not the whole floor, so a half-built floor isn't tiny.
  const placed = [...layout.units, ...layout.spaces, ...(layout.parking ?? [])].map((piece) => {
    const [fw, fh] = footprint(piece);
    return { x0: piece.x, y0: piece.y, x1: piece.x + fw, y1: piece.y + fh };
  });
  const bounds = placed.length
    ? {
        x0: Math.min(...placed.map((box) => box.x0)),
        y0: Math.min(...placed.map((box) => box.y0)),
        x1: Math.max(...placed.map((box) => box.x1)),
        y1: Math.max(...placed.map((box) => box.y1)),
      }
    : { x0: 0, y0: 0, x1: layout.width, y1: layout.depth };
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.y0 + bounds.y1) / 2;
  const centre = (piece: { x: number; y: number; w: number; h: number; rotation: number }) => {
    const [fw, fh] = footprint(piece as UnitPlacement);
    return [piece.x + fw / 2 - cx, 0, piece.y + fh / 2 - cz] as [number, number, number];
  };
  const selected =
    (layout.parking ?? []).find((spot) => selectedSlotId && spot.slotId === selectedSlotId) ??
    layout.units.find((placement) => placement.unitId === selectedUnitId);

  const [showLabels, setShowLabels] = useState(true);
  // Wall sizes show for the hovered or selected unit only, so a full floor stays readable.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Room names only once the view is close enough to read them.
  const [closeUp, setCloseUp] = useState(false);
  // On the Design page (nothing to pick) hovering only shows wall sizes; the unit keeps its chip.
  const taggedUnitId = onSelect ? (hoveredId ?? selectedUnitId) : selectedUnitId;
  const detailedUnitId = hoveredId ?? selectedUnitId;

  return (
    <div className="h-full">
      <SceneFrame
        resetKey={floorKey}
        fillHeight
        actions={
          <>
            {/* Only in full screen: the page's own floor list is out of sight there. */}
            {floors.length > 0 && onFloorChange && (
              <div className={alwaysShowFloorSwitch ? "block" : "hidden [:fullscreen_&]:block"}>
                <FloorMenu
                  propertyId={propertyId}
                  floors={floors}
                  current={floorKey}
                  onPick={onFloorChange}
                  canManage={canRenameFloors}
                />
              </div>
            )}
            {extraActions}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={showLabels}
              className="h-11 shrink-0 gap-2 px-3 text-[13px] shadow-none focus-visible:ring-2 focus-visible:ring-inset sm:h-9"
              onClick={() => setShowLabels(!showLabels)}
            >
              <Tag aria-hidden="true" className="size-4" />
              {showLabels ? "Hide labels" : "Show labels"}
            </Button>
          </>
        }
        width={bounds.x1 - bounds.x0 + 2}
        depth={bounds.y1 - bounds.y0 + 6}
        topView
        anchor={selected ? centre(selected) : null}
        onFallback={onFallback}
        scene={(openControls) => (
          <>
            <ZoomWatch onChange={setCloseUp} />
            <Surroundings
              kind={surroundings}
              width={layout.width + 0.25}
              depth={layout.depth + 0.25}
              centre={[layout.width / 2 - cx, layout.depth / 2 - cz]}
            />
            <Box
              position={[layout.width / 2 - cx, -0.24, layout.depth / 2 - cz]}
              size={[layout.width + 0.25, 0.35, layout.depth + 0.25]}
              color="#e9e4da"
            />
            {layout.spaces.map((space) => (
              <group
                key={space.id}
                position={centre(space)}
                rotation={[0, (-space.rotation * Math.PI) / 180, 0]}
              >
                <Space space={space} />
              </group>
            ))}
            {(layout.parking ?? []).map((spot) => {
              const slot = spot.slotId ? slotById.get(spot.slotId) : undefined;
              const taken = slot?.status === "deposit_paid" || slot?.status === "sold";
              return (
                <group
                  key={spot.id}
                  position={centre(spot)}
                  rotation={[0, (-spot.rotation * Math.PI) / 180, 0]}
                  onClick={(event: ThreeEvent<MouseEvent>) => {
                    event.stopPropagation();
                    if (event.delta >= 5 || !slot || !onSelectSlot) return;
                    onSelectSlot(slot.id);
                    openControls();
                  }}
                >
                  <ParkingBayModel
                    w={spot.w}
                    h={spot.h}
                    status={slot?.status ?? "available"}
                    selected={Boolean(slot) && slot?.id === selectedSlotId}
                  />
                  {slot && showLabels && (
                    <ParkingChip code={slot.code} status={slot.status} w={spot.w} />
                  )}
                  {taken && (
                    // The parking scene's car, scaled up from its smaller lot to a 2.5 m bay.
                    <DrivingIn from={[0, spot.h]}>
                      <group scale={1.75}>
                        <ParkedCar status={slot?.status ?? "deposit_paid"} reverse />
                      </group>
                    </DrivingIn>
                  )}
                </group>
              );
            })}
            {layout.units.map((placement) => {
              const unit = placement.unitId ? byId.get(placement.unitId) : undefined;
              const design = designs.get(placement.typeId);
              const [fw, fh] = footprint(placement);
              if (!unit || !design)
                return (
                  <Box
                    key={placement.id}
                    position={centre(placement)}
                    size={[fw - 0.1, 0.12, fh - 0.1]}
                    color="#d9dee4"
                  />
                );
              const isSelected = unit.id === selectedUnitId;
              const hasDetails = unit.id === detailedUnitId;
              const hasTag = unit.id === taggedUnitId;
              return (
                <group
                  key={placement.id}
                  position={centre(placement)}
                  onPointerEnter={() => setHoveredId(unit.id)}
                  onPointerLeave={() => setHoveredId((id) => (id === unit.id ? null : id))}
                  onClick={(event: ThreeEvent<MouseEvent>) => {
                    event.stopPropagation();
                    if (event.delta >= 5 || !onSelect) return;
                    onSelect(unit.id);
                    openControls();
                  }}
                >
                  <group rotation={[0, (-placement.rotation * Math.PI) / 180, 0]}>
                    <group scale={[placement.flip ? -1 : 1, 1, 1]}>
                      <DesignedUnit design={design} showNames={showLabels && closeUp} />
                    </group>
                  </group>
                  {/* Outside the mirrored group, so nothing reads backwards. */}
                  {isSelected && <SelectedOutline w={fw} h={fh} />}
                  {showLabels && !hasTag && (
                    <UnitChip
                      code={unit.code}
                      status={unit.status}
                      group={unit.group}
                      w={fw}
                      h={fh}
                    />
                  )}
                  {/* The full tag (group, price, status) only for the unit pointed at or picked. */}
                  {showLabels && hasTag && <UnitPlaque unit={unit} selected={isSelected} />}
                  {/* Each size sits on the wall it measures: width on the front, depth on the left. */}
                  {showLabels && hasDetails && (
                    <>
                      <WallMeasure metres={fw} position={[0, fh / 2]} />
                      <WallMeasure metres={fh} position={[-fw / 2, 0]} vertical />
                    </>
                  )}
                </group>
              );
            })}
          </>
        )}
      >
        {children}
      </SceneFrame>
    </div>
  );
}

/** A size tag lying on a wall, e.g. "8 m", drawn above the furniture so it is never hidden. */
function WallMeasure({
  metres,
  position,
  vertical,
}: {
  metres: number;
  position: [number, number];
  vertical?: boolean;
}) {
  const text = `${Number(metres.toFixed(2))} m`;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#34383c";
    context.beginPath();
    context.roundRect(4, 8, 248, 80, 40);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "700 54px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 50, 220);
    const measureTexture = new CanvasTexture(canvas);
    measureTexture.colorSpace = SRGBColorSpace;
    return measureTexture;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  const w = Math.min(2, metres * 0.25);
  return (
    <sprite
      position={[position[0], 2.6, position[1]]}
      scale={[w, (w * 96) / 256, 1]}
      renderOrder={999}
      raycast={() => null}
    >
      <spriteMaterial
        map={texture}
        rotation={vertical ? Math.PI / 2 : 0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

/** One unit, centred on its design: floor, walls, the rooms' partitions and furniture. */
function DesignedUnit({
  design,
  showNames,
}: {
  design: UnitDesign;
  /** Paint each room's name over it, as on a game floor plan. */
  showNames: boolean;
}) {
  const { width, depth } = design;

  // Partitions follow each room's edges, except where the outer wall already stands.
  const partitions = design.rooms.flatMap((room) => {
    const [fw, fh] = footprint(room);
    // Doors make openings, not walls.
    if (isDoor(room.kind)) return [];
    // A balcony outside the walls has its own railing, not partitions.
    if (
      room.x < -0.01 ||
      room.y < -0.01 ||
      room.x + fw > width + 0.01 ||
      room.y + fh > depth + 0.01
    )
      return [];
    const edges: { x: number; z: number; long: number; across: boolean }[] = [];
    if (room.y > 0.01) edges.push({ x: room.x + fw / 2, z: room.y, long: fw, across: true });
    if (room.y + fh < depth - 0.01)
      edges.push({ x: room.x + fw / 2, z: room.y + fh, long: fw, across: true });
    if (room.x > 0.01) edges.push({ x: room.x, z: room.y + fh / 2, long: fh, across: false });
    if (room.x + fw < width - 0.01)
      edges.push({ x: room.x + fw, z: room.y + fh / 2, long: fh, across: false });
    return edges.map((edge) => ({ ...edge, key: `${room.id}-${edge.x}-${edge.z}` }));
  });

  // A plant in the first corner no room takes, so open floor doesn't look bare.
  const corner = (
    [
      [0.45, depth - 0.45],
      [width - 0.45, depth - 0.45],
      [0.45, 0.45],
      [width - 0.45, 0.45],
    ] as const
  ).find(([x, z]) =>
    design.rooms.every((room) => {
      const [fw, fh] = footprint(room);
      return (
        x < room.x - 0.35 || x > room.x + fw + 0.35 || z < room.y - 0.35 || z > room.y + fh + 0.35
      );
    }),
  );

  return (
    <group position={[-width / 2, 0, -depth / 2]}>
      <UnitFloor width={width} depth={depth} />
      {design.rooms.map((room) => {
        const [fw, fh] = footprint(room);
        return (
          <group
            key={room.id}
            position={[room.x + fw / 2, 0, room.y + fh / 2]}
            rotation={[0, (-room.rotation * Math.PI) / 180, 0]}
          >
            <RoomFloor kind={room.kind} w={room.w} h={room.h} />
            <Room kind={room.kind} w={room.w} h={room.h} />
            {showNames && !isDoor(room.kind) && (
              <RoomName kind={room.kind} w={Math.min(fw, fh * 2)} />
            )}
          </group>
        );
      })}
      {corner && <Plant position={[corner[0], 0, corner[1]]} />}
      {partitions.map((edge) => (
        <Wall
          key={edge.key}
          position={[edge.x, 0, edge.z]}
          length={edge.long}
          across={edge.across}
          thickness={0.08}
        />
      ))}
      <Wall position={[width / 2, 0, 0]} length={width + 0.12} across thickness={0.12} />
      <Wall position={[0, 0, depth / 2]} length={depth} across={false} thickness={0.12} />
      <Wall position={[width, 0, depth / 2]} length={depth} across={false} thickness={0.12} />
      <Wall position={[width / 2, 0, depth]} length={width + 0.12} across thickness={0.12} />
    </group>
  );
}

function Wall({
  position,
  length,
  across,
  thickness,
}: {
  position: [number, number, number];
  length: number;
  across: boolean;
  thickness: number;
}) {
  const size = (height: number, extra = 0): [number, number, number] =>
    across ? [length, height, thickness + extra] : [thickness + extra, height, length];
  return (
    <group position={position}>
      <Box position={[0, 0.38, 0]} size={size(0.76)} color={WALL} />
      <Box position={[0, 0.79, 0]} size={size(0.06, 0.02)} color={CAP} />
    </group>
  );
}

/** A room's floor finish and furniture, centred, with its furniture against its top wall. */
function Room({ kind, w, h }: { kind: RoomKind; w: number; h: number }) {
  const fit = (needW: number, needH: number) => Math.min(1, w / needW, h / needH);
  const top = -h / 2;
  switch (kind) {
    case "bedroom":
      return (
        <>
          <group position={[0, 0, top + 1.38 * fit(2.6, 2.9)]} scale={fit(2.6, 2.9)}>
            <Bed position={[0, 0, 0]} />
          </group>
          {w >= 3 && h >= 3.6 && <Plant position={[w / 2 - 0.35, 0, h / 2 - 0.35]} />}
          {w >= 3.4 && h >= 4.2 && (
            <group position={[0, 0, h / 2 - 0.55]} rotation={[0, Math.PI, 0]}>
              <Desk position={[0, 0, 0]} />
            </group>
          )}
        </>
      );
    case "bathroom":
      return (
        <>
          <Box position={[0, 0.03, 0]} size={[w - 0.05, 0.035, h - 0.05]} color="#c7c9c8" />
          <group scale={fit(1.8, 2.45)}>
            <group position={[-1.2, 0, -2.12]}>
              <Bathroom />
            </group>
          </group>
        </>
      );
    case "kitchen":
      return (
        <group position={[0, 0, top + 0.42]} scale={fit(1.7, 0.9)}>
          <group position={[0.78, 0, -2.13]}>
            <Kitchen />
          </group>
        </group>
      );
    case "living": {
      const s = fit(2.6, 2.6);
      return (
        <group scale={s}>
          <Box position={[0, 0.25, top / s + 0.25]} size={[1.6, 0.5, 0.4]} color="#3f3a36" />
          <Box position={[0, 0.62, top / s + 0.22]} size={[1.1, 0.62, 0.05]} color="#20262b" />
          <Box position={[0, 0.012, 0.1]} size={[2.2, 0.012, 1.5]} color="#d8d2c6" />
          <Box position={[0, 0.22, 0]} size={[1, 0.08, 0.55]} color="#977350" />
          <Sofa position={[0, 0, h / (2 * s) - 0.55]} />
          {w >= 3.2 && <Plant position={[-w / (2 * s) + 0.35, 0, top / s + 0.35]} />}
        </group>
      );
    }
    case "dining": {
      const s = fit(2.2, 2.2);
      return (
        <group scale={s}>
          <Box position={[0, 0.74, 0]} size={[1.4, 0.06, 0.8]} color="#977350" />
          {[-0.55, 0.55].map((x) => (
            <Box key={x} position={[x, 0.36, 0]} size={[0.06, 0.72, 0.6]} color="#6a5641" />
          ))}
          {[-0.35, 0.35].flatMap((x) =>
            [-0.62, 0.62].map((z) => (
              <group key={`${x}${z}`} position={[x, 0, z]}>
                <Box position={[0, 0.45, 0]} size={[0.42, 0.06, 0.42]} color="#c9c1b4" />
                <Box
                  position={[0, 0.72, z > 0 ? 0.19 : -0.19]}
                  size={[0.42, 0.5, 0.05]}
                  color="#b8ae9f"
                />
              </group>
            )),
          )}
        </group>
      );
    }
    case "balcony":
      return (
        <>
          <Box position={[0, 0.03, 0]} size={[w - 0.05, 0.035, h - 0.05]} color="#cdbfa9" />
          <mesh position={[0, 0.5, h / 2 - 0.06]}>
            <boxGeometry args={[w - 0.1, 0.9, 0.04]} />
            <meshStandardMaterial color="#bddbe2" transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <Box position={[0, 0.97, h / 2 - 0.06]} size={[w - 0.1, 0.04, 0.06]} color="#adb9bd" />
          <Plant position={[-w / 2 + 0.35, 0, -h / 2 + 0.35]} />
          {w >= 2 && (
            <>
              <mesh position={[0, 0.36, 0]} castShadow>
                <cylinderGeometry args={[0.28, 0.28, 0.04, 20]} />
                <meshStandardMaterial color="#f2f1ed" />
              </mesh>
              {[-0.6, 0.6].map((x) => (
                <Box key={x} position={[x, 0.22, 0]} size={[0.42, 0.06, 0.42]} color="#8c7b66" />
              ))}
            </>
          )}
        </>
      );
    case "closet":
      return (
        <>
          <Box position={[0, 0.95, top + 0.32]} size={[w - 0.2, 1.9, 0.6]} color="#cbb89c" />
          {Array.from({ length: Math.max(1, Math.floor((w - 0.2) / 0.6)) - 1 }, (_, i) => (
            <Box
              key={i}
              position={[
                -w / 2 + 0.1 + ((i + 1) * (w - 0.2)) / Math.max(1, Math.floor((w - 0.2) / 0.6)),
                1.91,
                top + 0.32,
              ]}
              size={[0.02, 0.01, 0.6]}
              color="#7d6a52"
            />
          ))}
        </>
      );
    case "study":
      return (
        <group position={[0, 0, top + 0.4 * fit(1.8, 1.4)]} scale={fit(1.8, 1.4)}>
          <Desk position={[0, 0, 0]} />
        </group>
      );
    case "laundry":
      return (
        <>
          {(w >= 1.4 ? [-0.33, 0.33] : [0]).map((x) => (
            <group key={x} position={[x, 0, top + 0.38]}>
              <Box position={[0, 0.42, 0]} size={[0.6, 0.84, 0.6]} color="#f2f3ee" />
              <mesh position={[0, 0.85, 0.05]}>
                <cylinderGeometry args={[0.2, 0.2, 0.02, 20]} />
                <meshStandardMaterial color="#9fb3bd" />
              </mesh>
            </group>
          ))}
        </>
      );
    case "powder":
      return (
        <>
          <Box position={[0, 0.03, 0]} size={[w - 0.05, 0.035, h - 0.05]} color="#c7c9c8" />
          <Box
            position={[-w / 2 + 0.33, 0.2, top + 0.45]}
            size={[0.38, 0.4, 0.55]}
            color="#f7f7f3"
          />
          {w >= 1.1 && (
            <Box
              position={[w / 2 - 0.3, 0.8, top + 0.22]}
              size={[0.42, 0.12, 0.36]}
              color="#f2f3ee"
            />
          )}
        </>
      );
    case "storage":
      return (
        <>
          <Box position={[0, 0.9, top + 0.22]} size={[w - 0.1, 1.8, 0.4]} color="#a99b88" />
          <Box
            position={[-w / 2 + 0.25, 0.9, 0.22]}
            size={[0.4, 1.8, Math.max(0.2, h - 0.6)]}
            color="#a99b88"
          />
        </>
      );
    case "door": {
      // Seen from above: the wall opens along the bottom edge, the leaf stands open at the
      // hinge (bottom left), and a faint arc shows its swing.
      const leaf = Math.min(w, h);
      return (
        <>
          <Box position={[0, 0.83, h / 2]} size={[w, 0.03, 0.24]} color="#c9a173" />
          <Box
            position={[-w / 2 + 0.03, 0.5, h / 2 - leaf / 2]}
            size={[0.05, 1, leaf - 0.04]}
            color="#8a5a34"
          />
          <mesh position={[-w / 2, 0.02, h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[leaf - 0.04, leaf, 24, 1, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#8a5a34" transparent opacity={0.5} />
          </mesh>
        </>
      );
    }
    case "maids":
      return (
        <group position={[-w / 2 + 0.6, 0, top + 1.1]}>
          <Box position={[0, 0.18, 0]} size={[1, 0.3, 1.95]} color="#b8b4ae" />
          <Box position={[0, 0.36, 0.05]} size={[0.92, 0.06, 1.7]} color="#eff2f4" />
          <Box position={[0, 0.4, -0.78]} size={[0.7, 0.08, 0.3]} color="#f9f9f7" />
        </group>
      );
    case "foyer":
      return (
        <>
          <Box
            position={[0, 0.02, h / 2 - 0.45]}
            size={[Math.min(0.9, w - 0.3), 0.02, 0.55]}
            color="#8f8577"
          />
          <Box
            position={[0, 0.45, top + 0.2]}
            size={[Math.min(1.1, w - 0.2), 0.9, 0.35]}
            color="#d8d2c6"
          />
        </>
      );
    default:
      return null;
  }
}

function Sofa({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox
        args={[2, 0.42, 0.9]}
        radius={0.08}
        smoothness={3}
        position={[0, 0.21, 0]}
        castShadow
      >
        <meshStandardMaterial color="#9aa3a8" roughness={0.95} />
      </RoundedBox>
      <RoundedBox
        args={[2, 0.45, 0.22]}
        radius={0.08}
        smoothness={3}
        position={[0, 0.55, 0.34]}
        castShadow
      >
        <meshStandardMaterial color="#8d969b" roughness={0.95} />
      </RoundedBox>
      {[-0.92, 0.92].map((x) => (
        <RoundedBox
          key={x}
          args={[0.18, 0.55, 0.9]}
          radius={0.06}
          smoothness={3}
          position={[x, 0.3, 0]}
          castShadow
        >
          <meshStandardMaterial color="#8d969b" roughness={0.95} />
        </RoundedBox>
      ))}
    </group>
  );
}

/** Hallway, elevator, stairs, lobby or utility, centred at its own size. */
function Space({ space }: { space: FloorSpace }) {
  const { w, h } = space;
  switch (space.kind) {
    // Drive paths, ramps and pillars are drawn the way the parking lot draws them.
    case "driveway":
    case "ramp":
    case "pillar":
      return <PieceModel piece={space} />;
    case "elevator":
      return (
        <>
          <Box position={[0, 0.45, 0]} size={[w - 0.1, 0.9, h - 0.1]} color="#b9c0c7" />
          <Box position={[0, 0.91, 0]} size={[w - 0.1, 0.02, h - 0.1]} color="#8e979f" />
          <Box position={[0, 0.93, 0]} size={[0.04, 0.01, h - 0.3]} color="#5d656c" />
        </>
      );
    case "stairs": {
      const steps = Math.max(3, Math.floor(w / 0.3));
      return (
        <>
          {Array.from({ length: steps }, (_, i) => (
            <Box
              key={i}
              position={[-w / 2 + (i + 0.5) * (w / steps), 0.05 + i * 0.05, 0]}
              size={[w / steps - 0.02, 0.1 + i * 0.1, h - 0.1]}
              color={i % 2 ? "#cfd4d9" : "#c3c9cf"}
            />
          ))}
        </>
      );
    }
    case "lobby":
      return (
        <>
          <Box position={[0, 0.02, 0]} size={[w, 0.03, h]} color="#e6e2da" />
          <Plant position={[-w / 2 + 0.4, 0, -h / 2 + 0.4]} />
          {w >= 3 && h >= 2.5 && <Sofa position={[0, 0, -h / 2 + 0.6]} />}
        </>
      );
    default:
      return (
        <Box
          position={[0, 0.02, 0]}
          size={[w, 0.03, h]}
          color={space.kind === "utility" ? "#cfd3d6" : "#e2e4e6"}
        />
      );
  }
}
