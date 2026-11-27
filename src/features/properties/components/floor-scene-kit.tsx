"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import {
  BoxGeometry,
  CanvasTexture,
  MeshStandardMaterial,
  MOUSE,
  SRGBColorSpace,
  TOUCH,
  Vector3,
  type PerspectiveCamera,
} from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Loader2, Maximize, Minimize, X } from "lucide-react";
import { unitStatusLabel } from "../lib/unit-codes";
import type { UnitGroup } from "../lib/sections";

/** The illustrated 3D floor's shared parts: the frame, camera, furniture and unit labels. */

export type SceneUnit = {
  id: string;
  code: string;
  status: string;
  group?: UnitGroup | null;
  /** Its price, already short, such as "₱30M". */
  price?: string | null;
};
export const statusColor: Record<string, string> = {
  available: "#3b8b69",
  deposit_paid: "#b17b35",
  sold: "#af5960",
  inactive: "#727e8b",
};

/**
 * The canvas, lights and camera around a floor, with the selected unit's controls floating next
 * to it. `anchor` is where that unit is in the scene.
 */
/** How far a top view leans from straight down, in radians: enough to fix which way is up. */
const TOP_TILT = 0.02;

export function SceneFrame({
  width,
  depth,
  topView,
  fillHeight = false,
  resetKey = "",
  anchor,
  onFallback,
  actions,
  children,
  scene,
}: {
  width: number;
  depth: number;
  topView: boolean;
  fillHeight?: boolean;
  /** Changing it puts the camera back to fit, e.g. on switching floors. */
  resetKey?: string;
  anchor: [number, number, number] | null;
  onFallback: () => void;
  /** Buttons in the bottom-right corner, beside full screen and kept there in full screen. */
  actions?: ReactNode;
  /** The selected unit's controls. */
  children: ReactNode;
  /** The floor itself; call `openControls` after selecting a unit. */
  scene: (openControls: () => void) => ReactNode;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  // The browser's own full screen for just the 3D view; the camera refits when it changes.
  const [fullScreen, setFullScreen] = useState(false);
  // Building a floor takes a moment; a loading cover hides the blank canvas until it has drawn.
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(0);
  useEffect(() => {
    const sync = () => {
      setFullScreen(document.fullscreenElement === frameRef.current);
      setView((current) => current + 1);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullScreen = () => {
    // The browser can refuse (no permission, no gesture); the view just stays as it is.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frameRef.current?.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    if (!controlsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [controlsOpen]);
  const height = 2.4;
  const reach = Math.max(14, width / 2 + 2, depth / 2 + 2);
  return (
    <div className={cn("@container", fillHeight && "h-full")}>
      <div
        ref={frameRef}
        className={cn(
          "relative overflow-hidden bg-[#f9fbfd] [&:fullscreen]:h-dvh!",
          topView && "cursor-grab touch-none active:cursor-grabbing",
        )}
        // A top view takes the floor's own shape, so a long floor leaves no empty bands.
        style={{
          height: fillHeight
            ? "100%"
            : topView
              ? `clamp(240px, calc(100cqw * ${depth / width}), 680px)`
              : "clamp(400px, 48vw, 680px)",
        }}
        role="region"
        aria-label="Illustrative 3D floor layout"
      >
        <Canvas
          // Standard shadow maps: the "soft" kind was removed from three.js and only logged a warning.
          shadows="percentage"
          frameloop="demand"
          onCreated={({ gl, scene, camera }) => {
            gl.render(scene, camera);
            requestAnimationFrame(() => setReady(true));
          }}
          dpr={[1, 1.5]}
          camera={{ position: [-12, 16, 16], fov: 36, near: 0.1, far: 2000 }}
          gl={{ antialias: true }}
          fallback={
            <div className="grid h-full place-content-center gap-3 p-5 text-center text-sm">
              <p>3D is unavailable on this device.</p>
              <Button onClick={onFallback}>Open list</Button>
            </div>
          }
        >
          <color attach="background" args={["#f9fbfd"]} />
          <ambientLight intensity={1.25} />
          <hemisphereLight args={["#f7faff", "#b1a898", 1.1]} />
          <directionalLight
            color="#fff3e2"
            position={[-6, 14, -7]}
            intensity={2.6}
            castShadow
            // 1024 is plenty from a top view and four times lighter to redraw than 2048.
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-reach}
            shadow-camera-right={reach}
            shadow-camera-top={reach}
            shadow-camera-bottom={-reach}
            shadow-normalBias={0.025}
            shadow-radius={3}
          />
          <FloorCamera
            key={`camera-${resetKey}-${view}`}
            width={width}
            depth={depth}
            height={height}
            topView={topView}
          />
          {scene(() => setControlsOpen(true))}
          {controlsOpen && <UnitControlsAnchor controlsRef={controlsRef} anchor={anchor} />}
          <OrbitControls
            key={`controls-${resetKey}-${view}`}
            makeDefault
            enableDamping={false}
            // Top views drag like a map: one finger or the left button moves, pinch or wheel zooms.
            enablePan={topView}
            screenSpacePanning
            mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
            touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
            enableRotate={!topView}
            target={[0, height / 2, 0]}
            minDistance={3}
            maxDistance={Math.max(width, depth, height) * 12}
            // A top view is pinned to one angle: looking dead straight down leaves its compass
            // direction to rounding error, and the floor could spin after a drag.
            minPolarAngle={topView ? TOP_TILT : 0.05}
            maxPolarAngle={topView ? TOP_TILT : Math.PI / 3}
            minAzimuthAngle={topView ? 0 : -Math.PI / 2.2}
            maxAzimuthAngle={topView ? 0 : Math.PI / 2.2}
          />
        </Canvas>
        <div
          aria-hidden={ready}
          className={cn(
            "pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#f9fbfd] transition-opacity duration-300 motion-reduce:transition-none",
            ready ? "opacity-0" : "opacity-100",
          )}
        >
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading floor…
          </span>
        </div>
        {/* The view's own controls sit together in one corner: labels, then full screen. */}
        <div
          role="group"
          aria-label="Floor plan controls"
          className="absolute right-2 bottom-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg border border-border/60 bg-card p-1 shadow-md sm:right-3 sm:bottom-3"
        >
          {actions}
          {/* Phones without element full screen (iPhone Safari) just don't get the button. */}
          {document.fullscreenEnabled && (
            <>
              <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-border/60" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground shadow-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset sm:size-9"
                aria-label={fullScreen ? "Exit full screen" : "Full screen"}
                title={fullScreen ? "Exit full screen" : "Full screen"}
                onClick={toggleFullScreen}
              >
                {fullScreen ? (
                  <Minimize aria-hidden="true" className="size-4" />
                ) : (
                  <Maximize aria-hidden="true" className="size-4" />
                )}
              </Button>
            </>
          )}
        </div>
        <div
          ref={controlsRef}
          role="region"
          aria-label="Selected unit controls"
          className="absolute top-0 left-0 z-10 max-h-[calc(100%-16px)] w-72 max-w-[calc(100%-16px)] overflow-y-auto rounded-lg"
          style={{ visibility: "hidden" }}
        >
          {controlsOpen && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-1.5 z-10 size-7"
                aria-label="Close unit controls"
                onClick={() => setControlsOpen(false)}
              >
                <X className="size-4" />
              </Button>
              {children}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitControlsAnchor({
  controlsRef,
  anchor,
}: {
  controlsRef: RefObject<HTMLDivElement | null>;
  anchor: [number, number, number] | null;
}) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const panel = controlsRef.current;
    if (!panel) return;
    if (!anchor) {
      panel.style.visibility = "hidden";
      return;
    }
    const [x, , z] = anchor;
    point.set(x, 2.7, z).project(camera);
    panel.style.visibility = point.z < 1 ? "visible" : "hidden";
    const anchorX = ((point.x + 1) * size.width) / 2;
    const anchorY = ((1 - point.y) * size.height) / 2;
    const left =
      anchorX + 64 + panel.offsetWidth < size.width - 8
        ? anchorX + 64
        : anchorX - 64 - panel.offsetWidth;
    // Kept clear of the bottom-right controls (floor, Hide labels, full screen): 64 px.
    const top = Math.max(8, Math.min(size.height - panel.offsetHeight - 64, anchorY - 24));
    panel.style.transform = `translate3d(${Math.max(8, Math.min(size.width - panel.offsetWidth - 8, left))}px, ${top}px, 0)`;
  });
  return null;
}

function FloorCamera({
  width,
  depth,
  height,
  topView,
}: {
  width: number;
  depth: number;
  height: number;
  topView: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const direction = new Vector3(
      ...((topView ? [0, Math.cos(TOP_TILT), Math.sin(TOP_TILT)] : [-0.65, 1, 0.9]) as [
        number,
        number,
        number,
      ]),
    ).normalize();
    const target = new Vector3(0, height / 2, 0);
    const point = new Vector3();
    let distance = Math.max(width, depth, height) * 1.8;
    for (let attempt = 0; attempt < 3; attempt++) {
      perspective.position.copy(direction).multiplyScalar(distance).add(target);
      perspective.lookAt(target);
      perspective.updateMatrixWorld();
      let extent = 0;
      for (const x of [-width / 2 - 0.3, width / 2 + 0.3])
        for (const y of [-0.3, height])
          for (const z of [-depth / 2, depth / 2]) {
            point.set(x, y, z).project(perspective);
            extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
          }
      if (attempt < 2) distance *= extent * 1.1;
    }
    perspective.position.copy(direction).multiplyScalar(distance).add(target);
    perspective.lookAt(target);
    perspective.updateMatrixWorld();
    invalidate();
  }, [camera, size.width, size.height, width, depth, height, topView, invalidate]);
  return null;
}

export function Bed({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box position={[0, 0.025, 0]} size={[2.15, 0.035, 2.66]} color="#c6c4bf" />
      <Box position={[0, 0.22, 0]} size={[1.83, 0.34, 2.2]} color="#b8b4ae" />
      <RoundedBox
        args={[1.82, 0.23, 2.16]}
        radius={0.12}
        smoothness={3}
        position={[0, 0.46, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#f9f9f7" roughness={0.95} />
      </RoundedBox>
      <RoundedBox
        args={[1.85, 0.2, 1.52]}
        radius={0.13}
        smoothness={3}
        position={[0, 0.61, 0.31]}
        castShadow
      >
        <meshStandardMaterial color="#eff2f4" roughness={0.97} />
      </RoundedBox>
      <Box position={[0, 0.49, -1.15]} size={[1.94, 0.96, 0.1]} color="#b9a58c" />
      {/* A coloured throw and a rug give each bedroom some warmth. */}
      <RoundedBox
        args={[1.9, 0.05, 0.55]}
        radius={0.02}
        smoothness={2}
        position={[0, 0.72, 0.72]}
        castShadow
      >
        <meshStandardMaterial color="#c98b6b" roughness={1} />
      </RoundedBox>
      <Box position={[0, 0.008, 1.62]} size={[2.3, 0.01, 0.7]} color="#d7c4a3" />
      {[-0.44, 0.44].map((x) => (
        <RoundedBox
          key={x}
          args={[0.72, 0.15, 0.44]}
          radius={0.12}
          smoothness={3}
          position={[x, 0.65, -0.73]}
          rotation={[0, x * 0.08, 0]}
          castShadow
        >
          <meshStandardMaterial color="#fffefb" roughness={1} />
        </RoundedBox>
      ))}
      <Box position={[0, 0.72, 0.69]} size={[1.85, 0.025, 0.23]} color="#d8e1e0" />
      <Box position={[-1.12, 0.3, -0.75]} size={[0.35, 0.56, 0.42]} color="#9c8a75" />
    </group>
  );
}

export function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Box position={[0, 0.83, 0]} size={[1.65, 0.08, 0.68]} color="#977350" />
      <Box position={[0.57, 0.4, 0]} size={[0.44, 0.8, 0.6]} color="#866849" />
      <Box position={[-0.64, 0.4, 0]} size={[0.055, 0.8, 0.57]} color="#6a665f" />
      <Box position={[0.13, 1.21, -0.12]} size={[0.8, 0.51, 0.045]} color="#39444b" />
      <Box position={[0.13, 1.21, -0.09]} size={[0.72, 0.43, 0.008]} color="#253845" />
      <Box position={[0.13, 0.95, -0.11]} size={[0.045, 0.22, 0.045]} color="#566067" />
      <Box position={[0.13, 0.89, 0.16]} size={[0.48, 0.035, 0.17]} color="#c6ccce" />
      {Array.from({ length: 3 }, (_, index) => (
        <Box
          key={index}
          position={[-0.58, 0.91 + index * 0.06, -0.07]}
          size={[0.21, 0.045, 0.3]}
          color={["#b08d68", "#ccd3ca", "#697985"][index]}
        />
      ))}
      <Box position={[-0.12, 0.47, 0.72]} size={[0.52, 0.1, 0.5]} color="#777d7b" />
      <Box position={[-0.12, 0.75, 0.96]} size={[0.52, 0.55, 0.07]} color="#68706f" />
      <Box position={[-0.12, 0.22, 0.72]} size={[0.065, 0.42, 0.065]} color="#40494b" />
      <Box position={[-0.12, 0.055, 0.72]} size={[0.65, 0.06, 0.065]} color="#3e4649" />
    </group>
  );
}

export function Kitchen() {
  return (
    <group position={[-0.78, 0, 2.13]}>
      <Box position={[0, 0.44, 0]} size={[1.48, 0.86, 0.58]} color="#5c5046" />
      <Box position={[0, 0.9, 0]} size={[1.56, 0.07, 0.67]} color="#e2e1dc" />
      {[-0.48, 0, 0.48].map((x) => (
        <Box key={x} position={[x, 0.48, 0.302]} size={[0.018, 0.73, 0.012]} color="#342f2b" />
      ))}
      <Box position={[-0.22, 0.94, 0]} size={[0.51, 0.016, 0.35]} color="#aeb4b3" />
      <Box position={[-0.22, 0.952, 0]} size={[0.4, 0.012, 0.25]} color="#6d7a7e" />
      <mesh position={[-0.22, 1.04, -0.15]}>
        <torusGeometry args={[0.1, 0.015, 6, 16, Math.PI]} />
        <meshStandardMaterial color="#c7ced0" metalness={0.65} roughness={0.25} />
      </mesh>
      <Box position={[0.6, 1.42, -0.19]} size={[0.3, 1, 0.4]} color="#65615b" />
    </group>
  );
}

export function Bathroom() {
  return (
    <group position={[1.2, 0, 2.12]}>
      <Box position={[0, 0.03, 0]} size={[1.7, 0.035, 2.36]} color="#c7c9c8" />
      <Box position={[0.31, 0.43, -0.64]} size={[1, 0.82, 0.48]} color="#766f66" />
      <Box position={[0.31, 0.87, -0.64]} size={[1.08, 0.07, 0.55]} color="#f6f6f3" />
      <RoundedBox
        args={[0.58, 0.1, 0.34]}
        radius={0.06}
        smoothness={2}
        position={[0.31, 0.96, -0.64]}
      >
        <meshStandardMaterial color="#fff" roughness={0.2} />
      </RoundedBox>
      <Box position={[0.81, 1.43, -0.64]} size={[0.065, 0.79, 0.7]} color="#d0d1cb" />
      <Box position={[0.77, 1.43, -0.64]} size={[0.045, 0.72, 0.64]} color="#a9c4cd" />
      <RoundedBox
        args={[0.43, 0.4, 0.64]}
        radius={0.16}
        smoothness={3}
        position={[0.25, 0.26, 0.39]}
      >
        <meshStandardMaterial color="#f7f7f3" roughness={0.25} />
      </RoundedBox>
      <Box position={[0.25, 0.57, 0.63]} size={[0.43, 0.56, 0.16]} color="#f2f3ee" />
      <mesh position={[-0.56, 0.95, 0.33]}>
        <boxGeometry args={[0.028, 1.82, 1.55]} />
        <meshStandardMaterial
          color="#bddbe2"
          transparent
          opacity={0.2}
          roughness={0.15}
          depthWrite={false}
        />
      </mesh>
      <Box position={[-0.56, 1.88, 0.33]} size={[0.045, 0.045, 1.55]} color="#adb9bd" />
    </group>
  );
}

export function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.12, 0.38, 12]} />
        <meshStandardMaterial color="#efefea" roughness={0.8} />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh
          key={index}
          position={[Math.cos(index) * 0.12, 0.5 + (index % 3) * 0.12, Math.sin(index) * 0.12]}
          rotation={[Math.cos(index) * 0.4, 0, Math.sin(index) * 0.4]}
          scale={[0.075, 0.38, 0.06]}
          castShadow
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color={index % 2 ? "#617b50" : "#819466"} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Unit tags painted once per look (code, group, price, status, selected) and shared, so switching
 * floors reuses them instead of painting every tag again.
 * shortcut: never freed; tags are small and a property has a few hundred at most.
 */
const plaques = new Map<string, { texture: CanvasTexture; pixels: number }>();
function paintPlaque(unit: SceneUnit, selected: boolean, height: number) {
  const key = [
    unit.code,
    unit.status,
    unit.group?.name,
    unit.group?.hex,
    unit.price,
    selected,
  ].join("|");
  const cached = plaques.get(key);
  if (cached) return cached;
  const painted = (() => {
    const measure = document.createElement("canvas").getContext("2d")!;
    const theme = getComputedStyle(document.documentElement);
    const colour = statusColor[unit.status] ?? statusColor.inactive;
    const rows = [
      [
        { text: unit.code, font: '600 58px "Inter", "Segoe UI", sans-serif', colour: "#1f2937" },
        ...(unit.group
          ? [
              {
                text: unit.group.name,
                font: '600 44px "Inter", "Segoe UI", sans-serif',
                colour: unit.group.hex,
              },
            ]
          : []),
      ],
      [
        ...(unit.price
          ? [
              {
                text: unit.price,
                font: '600 44px "Inter", "Segoe UI", sans-serif',
                colour: "#1f2937",
              },
            ]
          : []),
        {
          text: unitStatusLabel(unit.status),
          font: '400 44px "Inter", "Segoe UI", sans-serif',
          colour: "#4b5563",
        },
      ],
    ];
    const gap = 22;
    const widths = rows.map((parts) =>
      parts.map((part) => {
        measure.font = part.font;
        return measure.measureText(part.text).width;
      }),
    );
    const contentWidth = Math.max(
      ...widths.map((row) => row.reduce((sum, width) => sum + width, 0) + gap * (row.length - 1)),
    );
    const dotRoom = 40;
    const padding = 34;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(Math.max(512, contentWidth + dotRoom + padding * 2 + 12));
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.strokeStyle = selected ? theme.getPropertyValue("--primary").trim() : "#d3d6db";
    context.lineWidth = selected ? 8 : 2;
    context.beginPath();
    context.roundRect(6, 6, canvas.width - 12, height - 12, 22);
    context.fill();
    context.stroke();
    context.fillStyle = colour;
    context.beginPath();
    context.arc(6 + padding + 12, 130, 10, 0, Math.PI * 2);
    context.fill();
    context.textBaseline = "middle";
    rows.forEach((parts, row) => {
      let x = 6 + padding + dotRoom;
      parts.forEach((part, index) => {
        context.font = part.font;
        context.fillStyle = part.colour;
        context.fillText(part.text, x, row === 0 ? 57 : 130);
        x += widths[row][index] + gap;
      });
    });
    const labelTexture = new CanvasTexture(canvas);
    labelTexture.colorSpace = SRGBColorSpace;
    return { texture: labelTexture, pixels: canvas.width };
  })();
  plaques.set(key, painted);
  return painted;
}

export function UnitPlaque({
  unit,
  selected,
  z = 0,
}: {
  unit: SceneUnit;
  selected: boolean;
  /** Where its bottom edge sits, in metres in front of (+) or behind (−) the unit's centre. */
  z?: number;
}) {
  const height = 184;
  // Two rows keep the metadata readable without running into the next unit's tag.
  const screenScale = useScreenScale();
  const { texture, pixels } = paintPlaque(unit, selected, height);
  return (
    <sprite
      name={`unit-label-${unit.id}`}
      position={[0, 2.7, z]}
      // Anchored by its bottom edge, so it grows away from the unit and never covers it.
      center={[0.5, 0]}
      // A fixed size on screen, 46 px tall, so it stays readable however far out the view is.
      scale={screenScale((46 * pixels) / height, 46)}
      renderOrder={1000}
      // The label never takes the pointer, so hovering it can't hide and show it in a loop.
      raycast={() => null}
    >
      <spriteMaterial
        map={texture}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

/**
 * A sprite scale that keeps it `px` wide and tall on screen at any zoom; use it with
 * `sizeAttenuation={false}` on the sprite's material.
 */
export function useScreenScale() {
  const { size, camera } = useThree();
  return (width: number, height: number): [number, number, number] => [
    (width * 2) / (size.width * camera.projectionMatrix.elements[0]),
    (height * 2) / (size.height * camera.projectionMatrix.elements[5]),
    1,
  ];
}

export function Box({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  // One shared unit cube, scaled to size, and one material per colour: a floor has thousands
  // of these, and building each its own geometry and material made switching floors slow.
  return (
    <mesh
      position={position}
      scale={size}
      geometry={unitCube}
      material={boxMaterial(color)}
      castShadow
      receiveShadow
    />
  );
}

const unitCube = new BoxGeometry(1, 1, 1);
const boxMaterials = new Map<string, MeshStandardMaterial>();
function boxMaterial(color: string) {
  let material = boxMaterials.get(color);
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.78 });
    boxMaterials.set(color, material);
  }
  return material;
}
