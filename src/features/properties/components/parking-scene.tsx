"use client";

import { isHeld } from "../lib/unit-codes";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import {
  CanvasTexture,
  RepeatWrapping,
  Shape,
  Vector3,
  type Group,
  type PerspectiveCamera,
} from "three";
import { Button } from "@/components/ui/button";
import { statusColor } from "./floor-scene-kit";
import { ParkingBay, type ParkingSlot } from "./parking-slots";
import styles from "./parking-slots.module.css";
import { footprint } from "../lib/floor-layout";
import type { FloorSpace } from "../lib/floor-layout";
import { parkingBayPosition, type ParkingPlan } from "../lib/parking-layout";

/** Designed parking is laid out in metres; drawn at this scale it matches the plain lot's cars. */
const METRE = 0.8;

export default function ParkingScene({
  slots: allSlots,
  canManage,
  topView,
  onFallback,
  layout = null,
}: {
  slots: ParkingSlot[];
  canManage: boolean;
  topView: boolean;
  onFallback: () => void;
  /** The floor's designed parking; without one, slots stand in two plain rows. */
  layout?: ParkingPlan | null;
}) {
  const placedById = new Map((layout?.slots ?? []).map((slot) => [slot.slotId, slot]));
  // A designed floor shows the slots on its plan; any not placed yet wait for the designer.
  const shown = layout ? allSlots.filter((slot) => placedById.has(slot.id)) : allSlots;
  const slots = shown;
  const columns = Math.ceil(slots.length / 2);
  const width = layout ? layout.width * METRE : columns * 2.2 + 1.8;
  const depth = layout ? layout.depth * METRE : 10;
  const positionOf = (slot: ParkingSlot, index: number): [number, number, number] => {
    const placed = layout && placedById.get(slot.id);
    if (!placed) return parkingBayPosition(index, slots.length);
    const [fw, fh] = footprint(placed);
    return [
      (placed.x + fw / 2 - layout.width / 2) * METRE,
      0,
      (placed.y + fh / 2 - layout.depth / 2) * METRE,
    ];
  };
  const anchors = useRef(new Map<string, HTMLDivElement>());
  return (
    <div className={styles.stage}>
      <Canvas
        // Standard shadow maps: the "soft" kind was removed from three.js and only logged a warning.
        shadows="percentage"
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: topView ? [0, 22, 0.01] : [0, 18, 12], fov: 38, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
        fallback={
          <div className="grid h-full place-content-center gap-3 p-6 text-center text-sm">
            <p>3D is unavailable on this device.</p>
            <Button onClick={onFallback}>Open parking list</Button>
          </div>
        }
      >
        <color attach="background" args={["#edf2f6"]} />
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#f1f8ff", "#87959d", 1.5]} />
        <directionalLight
          position={[-5, 12, 5]}
          intensity={2.8}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-normalBias={0.025}
        />
        <CameraFit width={width} depth={depth} topView={topView} />
        {layout ? (
          <DesignedLot layout={layout} />
        ) : (
          <ParkingStructure width={width} columns={columns} />
        )}
        {slots.map((slot, index) => {
          const row = index < columns ? 0 : 1;
          const taken = isHeld(slot.status);
          const placed = layout && placedById.get(slot.id);
          if (placed)
            return (
              <group
                key={slot.id}
                position={positionOf(slot, index)}
                rotation={[0, (-placed.rotation * Math.PI) / 180, 0]}
                scale={METRE}
              >
                <SlotPaint w={placed.w} h={placed.h} inactive={slot.status === "inactive"} />
                {taken && (
                  // In from the bay's open end, where the drive path is.
                  <DrivingIn from={[0, placed.h]}>
                    <ParkedCar status={slot.status} reverse />
                  </DrivingIn>
                )}
              </group>
            );
          return (
            <group key={slot.id} position={parkingBayPosition(index, slots.length)}>
              <BayPaint row={row} inactive={slot.status === "inactive"} />
              {taken && (
                <DrivingIn from={[0, row === 0 ? 3.4 : -3.4]}>
                  <ParkedCar status={slot.status} reverse={row === 0} />
                </DrivingIn>
              )}
            </group>
          );
        })}
        <ProjectControls slots={slots} anchors={anchors} positionOf={positionOf} />
        <OrbitControls
          makeDefault
          enableDamping={false}
          enablePan={false}
          enableRotate={!topView}
          minDistance={10}
          maxDistance={Math.max(35, width * 2, depth * 2)}
          // The top view is pinned straight down: zoom only, never tilted or turned.
          minPolarAngle={0.02}
          maxPolarAngle={topView ? 0.02 : Math.PI / 3}
          minAzimuthAngle={topView ? 0 : -Math.PI / 6}
          maxAzimuthAngle={topView ? 0 : Math.PI / 6}
        />
      </Canvas>
      <div className={styles.overlayRoot}>
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={styles.overlayAnchor}
            ref={(node) => {
              if (node) anchors.current.set(slot.id, node);
              else anchors.current.delete(slot.id);
            }}
          >
            <ul className={styles.overlay}>
              <ParkingBay slot={slot} canManage={canManage} />
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectControls({
  slots,
  anchors,
  positionOf,
}: {
  slots: ParkingSlot[];
  anchors: RefObject<Map<string, HTMLDivElement>>;
  positionOf: (slot: ParkingSlot, index: number) => [number, number, number];
}) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    slots.forEach((slot, index) => {
      const anchor = anchors.current.get(slot.id);
      if (!anchor) return;
      point.set(...positionOf(slot, index));
      point.y = 0.05;
      const distance = camera.position.distanceTo(point);
      const scale =
        ((size.height /
          (2 * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360) * distance)) *
          1.98) /
        128;
      point.project(camera);
      anchor.style.visibility = point.z > -1 && point.z < 1 ? "visible" : "hidden";
      anchor.style.transform = `translate3d(${((point.x + 1) * size.width) / 2}px,${((1 - point.y) * size.height) / 2}px,0) scale(${scale}) translate(-50%,-50%)`;
    });
  });
  return null;
}

function CameraFit({ width, depth, topView }: { width: number; depth: number; topView: boolean }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const distance =
      (Math.max((width + 1.4) / (size.width / size.height), depth + (topView ? 0.8 : -0.2)) /
        (2 * Math.tan((perspective.fov * Math.PI) / 360))) *
      1.12;
    perspective.position.set(
      0,
      topView ? distance : distance * 0.88,
      topView ? 0.01 : distance * 0.48,
    );
    perspective.lookAt(0, 0, 0);
    perspective.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, width, depth, topView, invalidate]);
  return null;
}

export function useAsphalt(repeatX: number, repeatY: number) {
  const asphalt = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(128, 128);
    let seed = 128;
    for (let index = 0; index < image.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const shade = 190 + (seed % 45);
      image.data[index] = image.data[index + 1] = image.data[index + 2] = shade;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
  }, [repeatX, repeatY]);
  useEffect(() => () => asphalt.dispose(), [asphalt]);
  return asphalt;
}

/** A designed floor's parking, drawn in metres from its plan. */
function DesignedLot({ layout }: { layout: ParkingPlan }) {
  const asphalt = useAsphalt(layout.width / 4, layout.depth / 4);
  const { width, depth } = layout;
  return (
    <group scale={METRE}>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <boxGeometry args={[width, 0.36, depth]} />
        <meshStandardMaterial color="#747d83" map={asphalt} roughness={0.96} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block
            position={[0, 0.3, side * (depth / 2 - 0.1)]}
            size={[width, 0.6, 0.2]}
            color="#9ca7ae"
          />
          <Block
            position={[side * (width / 2 - 0.1), 0.3, 0]}
            size={[0.2, 0.6, depth]}
            color="#9ca7ae"
          />
        </group>
      ))}
      {layout.pieces.map((piece) => {
        const [fw, fh] = footprint(piece);
        return (
          <group
            key={piece.id}
            position={[piece.x + fw / 2 - width / 2, 0, piece.y + fh / 2 - depth / 2]}
            rotation={[0, (-piece.rotation * Math.PI) / 180, 0]}
          >
            <PieceModel piece={piece} />
          </group>
        );
      })}
    </group>
  );
}

/** One drive path, ramp, pillar, stairs or elevator, centred, at its own size. */
export function PieceModel({ piece }: { piece: FloorSpace }) {
  const { w, h } = piece;
  switch (piece.kind) {
    case "driveway": {
      // Dashes and arrows run along the long side, the way cars drive.
      const along = w >= h;
      const length = along ? w : h;
      const dashes = Math.max(1, Math.floor(length / 1.6));
      return (
        <>
          <Block position={[0, 0.006, 0]} size={[w, 0.012, h]} color="#525e67" />
          {Array.from({ length: dashes }, (_, index) => {
            const at = -length / 2 + (index + 0.5) * (length / dashes);
            return (
              <Block
                key={index}
                position={along ? [at, 0.02, 0] : [0, 0.02, at]}
                size={along ? [0.8, 0.012, 0.1] : [0.1, 0.012, 0.8]}
                color="#ebeee7"
              />
            );
          })}
        </>
      );
    }
    case "ramp": {
      const tilt = Math.atan2(0.9, h);
      return (
        <mesh position={[0, 0.45, 0]} rotation={[tilt, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.12, Math.hypot(h, 0.9)]} />
          <meshStandardMaterial color="#a9b2b7" roughness={0.9} />
        </mesh>
      );
    }
    case "pillar":
      return <Block position={[0, 1.2, 0]} size={[w, 2.4, h]} color="#c9cfd3" />;
    case "stairs": {
      const steps = Math.max(3, Math.floor(w / 0.3));
      return (
        <>
          {Array.from({ length: steps }, (_, index) => (
            <Block
              key={index}
              position={[-w / 2 + (index + 0.5) * (w / steps), 0.05 + index * 0.05, 0]}
              size={[w / steps - 0.02, 0.1 + index * 0.1, h - 0.1]}
              color={index % 2 ? "#cfd4d9" : "#c3c9cf"}
            />
          ))}
        </>
      );
    }
    case "elevator":
      return (
        <>
          <Block position={[0, 0.9, 0]} size={[w - 0.1, 1.8, h - 0.1]} color="#b9c0c7" />
          <Block position={[0, 1.81, 0]} size={[0.04, 0.01, h - 0.3]} color="#5d656c" />
        </>
      );
  }
}

/** A designed slot's lines, in metres: its sides, its back line and a wheel stop. */
function SlotPaint({
  w,
  h,
  inactive,
  color,
}: {
  w: number;
  h: number;
  inactive: boolean;
  /** Overrides the line colour, e.g. to mark the picked slot. */
  color?: string;
}) {
  const line = color ?? (inactive ? "#aab0b1" : "#eeefe7");
  return (
    <>
      {[-w / 2, w / 2].map((x) => (
        <Block key={x} position={[x, 0.012, 0]} size={[0.08, 0.02, h]} color={line} />
      ))}
      <Block position={[0, 0.012, -h / 2]} size={[w, 0.02, 0.08]} color={line} />
      <Block position={[0, 0.06, -h / 2 + 0.6]} size={[w * 0.4, 0.12, 0.15]} color="#c5ac66" />
    </>
  );
}

/**
 * One bay as the parking lot draws it, in metres and centred: asphalt, white lines, the wheel
 * stop and a warm light at the back. Used for slots placed on a floor's design.
 */
export function ParkingBayModel({
  w,
  h,
  status,
  selected,
}: {
  w: number;
  h: number;
  status: string;
  selected: boolean;
}) {
  const asphalt = useAsphalt(Math.max(1, w / 2.5), Math.max(1, h / 2.5));
  const primary = selected
    ? getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
    : undefined;
  return (
    <>
      <mesh position={[0, 0.012, 0]} receiveShadow>
        <boxGeometry args={[w, 0.024, h]} />
        <meshStandardMaterial color="#747d83" map={asphalt} roughness={0.96} />
      </mesh>
      <group position={[0, 0.024, 0]}>
        <SlotPaint w={w} h={h} inactive={status === "inactive"} color={primary} />
      </group>
      <mesh position={[0, 0.07, -h / 2 + 0.08]}>
        <boxGeometry args={[Math.min(0.6, w * 0.3), 0.06, 0.08]} />
        <meshStandardMaterial color="#fff1cb" emissive="#ffd08a" emissiveIntensity={2.5} />
      </mesh>
    </>
  );
}

function ParkingStructure({ width, columns }: { width: number; columns: number }) {
  const asphalt = useAsphalt(10, 7);
  const arrow = useMemo(
    () =>
      new Shape()
        .moveTo(-0.55, 0)
        .lineTo(-0.08, 0.25)
        .lineTo(-0.08, 0.09)
        .lineTo(0.55, 0.09)
        .lineTo(0.55, -0.09)
        .lineTo(-0.08, -0.09)
        .lineTo(-0.08, -0.25)
        .closePath(),
    [],
  );
  return (
    <>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <boxGeometry args={[width, 0.36, 10]} />
        <meshStandardMaterial color="#747d83" map={asphalt} roughness={0.96} />
      </mesh>
      <Block position={[0, 0.4, -4.9]} size={[width, 0.9, 0.25]} color="#9ca7ae" />
      <Block position={[0, 0.05, 4.9]} size={[width, 0.4, 0.25]} color="#87969f" />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Block
            position={[side * (width / 2 - 0.12), 0.4, 0]}
            size={[0.25, 0.9, 10]}
            color="#9ca7ae"
          />
          {[-4.3, 4.3].map((z) => (
            <Plant key={z} position={[side * (width / 2 - 0.45), 0, z]} />
          ))}
        </group>
      ))}
      {Array.from({ length: columns + 1 }, (_, index) => {
        const x = (index - columns / 2) * 2.2;
        return (
          <group key={index}>
            {[-4.55, 4.55].map((z) => (
              <group key={z}>
                <Block position={[x, 0.48, z]} size={[0.21, 0.96, 0.36]} color="#aeb9c0" />
                <Block
                  position={[x, 0.17, z + (z < 0 ? 0.19 : -0.19)]}
                  size={[0.22, 0.34, 0.035]}
                  color="#d7a239"
                />
              </group>
            ))}
          </group>
        );
      })}
      {Array.from({ length: columns }, (_, index) => {
        const x = (index - (columns - 1) / 2) * 2.2;
        return (
          <group key={index}>
            <mesh position={[x, 0.62, -4.72]}>
              <boxGeometry args={[0.24, 0.07, 0.07]} />
              <meshStandardMaterial color="#fff1cb" emissive="#ffd08a" emissiveIntensity={3} />
            </mesh>
            <pointLight
              position={[x, 0.68, -4.35]}
              color="#ffd393"
              intensity={3}
              distance={3}
              decay={2}
            />
            <mesh position={[x, 0.12, 4.76]}>
              <boxGeometry args={[0.19, 0.06, 0.03]} />
              <meshStandardMaterial color="#ffe3ad" emissive="#ffbf69" emissiveIntensity={2} />
            </mesh>
          </group>
        );
      })}
      {Array.from({ length: columns * 2 }, (_, index) => (
        <Block
          key={index}
          position={[(index - (columns * 2 - 1) / 2) * 0.8, 0.015, 0]}
          size={[0.35, 0.015, 0.035]}
          color="#ebeee7"
        />
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * width * 0.34, 0.025, 0]}
          rotation={[-Math.PI / 2, 0, side === 1 ? Math.PI : 0]}
        >
          <shapeGeometry args={[arrow]} />
          <meshStandardMaterial color="#f1f3e9" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, index) => (
        <Block
          key={index}
          position={[-width / 2 + 0.46, 0.025 * (index + 1), -0.8 + index * 0.18]}
          size={[0.55, 0.05 * (index + 1), 0.18]}
          color={index % 2 ? "#9da8ac" : "#b7bfc2"}
        />
      ))}
    </>
  );
}

function BayPaint({ row, inactive }: { row: number; inactive: boolean }) {
  return (
    <>
      {[-1.1, 1.1].map((x) => (
        <Block
          key={x}
          position={[x, 0.01, 0]}
          size={[0.035, 0.02, 3.8]}
          color={inactive ? "#aab0b1" : "#eeefe7"}
        />
      ))}
      <Block
        position={[0, 0.01, row === 0 ? 1.9 : -1.9]}
        size={[2.2, 0.02, 0.035]}
        color="#eeefe7"
      />
      <Block
        position={[0, 0.055, row === 0 ? -1.25 : 1.25]}
        size={[0.85, 0.11, 0.13]}
        color="#c5ac66"
      />
    </>
  );
}

function Block({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.15, 0.36, 8]} />
        <meshStandardMaterial color="#5c6453" />
      </mesh>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(index * 1.25) * 0.12,
            0.46 + (index % 2) * 0.12,
            Math.sin(index * 1.25) * 0.12,
          ]}
          scale={[0.17, 0.23, 0.12]}
          castShadow
        >
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={index % 2 ? "#68892e" : "#8d9b36"} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A car that drives into its bay once, from `from` (its offset on the ground), easing to a stop.
 * Shows up already parked when the viewer asks for reduced motion.
 */
export function DrivingIn({ from, children }: { from: [number, number]; children: ReactNode }) {
  const group = useRef<Group>(null);
  const started = useRef<number | null>(null);
  const { invalidate } = useThree();
  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => invalidate(), [invalidate]);
  useFrame(({ clock }) => {
    const node = group.current;
    if (!node || still) return;
    started.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - started.current) / 1.6);
    const left = Math.pow(1 - t, 3);
    node.position.set(from[0] * left, 0, from[1] * left);
    // The scene only draws on demand, so ask for frames until the car has stopped.
    if (t < 1) invalidate();
  });
  return (
    <group ref={group} position={still ? [0, 0, 0] : [from[0], 0, from[1]]}>
      {children}
    </group>
  );
}

/** The car on a taken bay is painted its slot's status colour: amber reserved, red sold out. */
export function ParkedCar({ status, reverse }: { status: string; reverse: boolean }) {
  const paint = statusColor[status] ?? statusColor.inactive;
  return (
    <group position={[0, 0, 0.03]} rotation={[0, reverse ? Math.PI : 0, 0]}>
      <RoundedBox
        args={[1.02, 0.34, 2.15]}
        radius={0.13}
        smoothness={4}
        position={[0, 0.37, 0]}
        castShadow
      >
        <meshStandardMaterial color={paint} metalness={0.4} roughness={0.3} />
      </RoundedBox>
      <RoundedBox
        args={[0.86, 0.32, 1.04]}
        radius={0.12}
        smoothness={4}
        position={[0, 0.64, 0.05]}
        castShadow
      >
        <meshStandardMaterial color="#19374b" metalness={0.45} roughness={0.22} />
      </RoundedBox>
      <RoundedBox
        args={[0.78, 0.035, 0.63]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.814, 0.09]}
        castShadow
      >
        <meshStandardMaterial color={paint} metalness={0.35} roughness={0.25} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-0.66, 0.66].map((z) => (
            <group key={z} position={[side * 0.48, 0.23, z]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.22, 0.22, 0.17, 16]} />
                <meshStandardMaterial color="#182028" roughness={0.95} />
              </mesh>
              <mesh>
                <cylinderGeometry args={[0.12, 0.12, 0.18, 12]} />
                <meshStandardMaterial color="#adb7c0" metalness={0.6} roughness={0.3} />
              </mesh>
            </group>
          ))}
          <Block position={[side * 0.55, 0.59, -0.28]} size={[0.15, 0.08, 0.13]} color={paint} />
          <mesh position={[side * 0.32, 0.46, -1.065]}>
            <boxGeometry args={[0.23, 0.065, 0.035]} />
            <meshStandardMaterial color="#fff5cf" emissive="#eee3ba" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[side * 0.34, 0.42, 1.065]}>
            <boxGeometry args={[0.18, 0.055, 0.035]} />
            <meshStandardMaterial color="#b13e38" emissive="#a92c26" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      <Block position={[0, 0.29, -1.08]} size={[0.46, 0.08, 0.025]} color="#293640" />
      <Block position={[0, 0.29, 1.08]} size={[0.2, 0.06, 0.025]} color="#e7ecee" />
    </group>
  );
}
