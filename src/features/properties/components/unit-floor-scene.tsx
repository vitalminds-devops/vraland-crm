"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from "three";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { unitStatusLabel } from "../lib/unit-codes";
import {
  UNIT_ROOM_WIDTH,
  unitFloorColumns,
  unitRoomPosition,
  type UnitFloorArrangement,
} from "../lib/unit-floor-layout";

type SceneUnit = { id: string; code: string; status: string };
const statusColor: Record<string, string> = {
  available: "#3b8b69",
  deposit_paid: "#b17b35",
  sold: "#af5960",
  inactive: "#727e8b",
};

export default function UnitFloorScene({
  units,
  unitCount,
  arrangement,
  furnished,
  selectedUnitId,
  onSelect,
  topView,
  onFallback,
  children,
}: {
  units: SceneUnit[];
  unitCount: number;
  arrangement: UnitFloorArrangement;
  furnished: boolean;
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  topView: boolean;
  onFallback: () => void;
  children: ReactNode;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  useEffect(() => {
    if (!controlsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [controlsOpen]);
  const chooseUnit = (id: string) => {
    onSelect(id);
    setControlsOpen(true);
  };
  const width = unitFloorColumns(unitCount, arrangement) * UNIT_ROOM_WIDTH;
  const depth = unitCount > unitFloorColumns(unitCount, arrangement) ? 18 : 10;
  const height = 2.4;
  return (
    <div>
      <div
        className="relative overflow-hidden"
        style={{ height: "clamp(400px, 48vw, 680px)" }}
        role="region"
        aria-label="Illustrative 3D floor layout"
      >
        <Canvas
          shadows
          frameloop="demand"
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
            position={[-6, 14, -7]}
            intensity={2.6}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-14}
            shadow-camera-right={14}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-normalBias={0.025}
            shadow-radius={3}
          />
          <FloorCamera width={width} depth={depth} height={height} topView={topView} />
          <FloorBuilding
            width={width}
            unitCount={unitCount}
            arrangement={arrangement}
            furnished={furnished}
            units={units}
            selectedUnitId={selectedUnitId}
            onSelect={chooseUnit}
          />
          {controlsOpen && (
            <UnitControlsAnchor
              controlsRef={controlsRef}
              unitIndex={units.findIndex((unit) => unit.id === selectedUnitId)}
              unitCount={unitCount}
              arrangement={arrangement}
            />
          )}
          <OrbitControls
            makeDefault
            enableDamping={false}
            enablePan={false}
            enableRotate={!topView}
            target={[0, height / 2, 0]}
            minDistance={3}
            maxDistance={Math.max(width, depth, height) * 12}
            minPolarAngle={0.05}
            maxPolarAngle={Math.PI / 3}
            minAzimuthAngle={-Math.PI / 2.2}
            maxAzimuthAngle={Math.PI / 2.2}
          />
        </Canvas>
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
  unitIndex,
  unitCount,
  arrangement,
}: {
  controlsRef: RefObject<HTMLDivElement | null>;
  unitIndex: number;
  unitCount: number;
  arrangement: UnitFloorArrangement;
}) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const panel = controlsRef.current;
    if (!panel) return;
    if (unitIndex < 0) {
      panel.style.visibility = "hidden";
      return;
    }
    const [x, , z] = unitRoomPosition(unitIndex, unitCount, arrangement);
    point.set(x, 2.7, z).project(camera);
    panel.style.visibility = point.z < 1 ? "visible" : "hidden";
    const anchorX = ((point.x + 1) * size.width) / 2;
    const anchorY = ((1 - point.y) * size.height) / 2;
    const left =
      anchorX + 64 + panel.offsetWidth < size.width - 8
        ? anchorX + 64
        : anchorX - 64 - panel.offsetWidth;
    const top = Math.max(8, Math.min(size.height - panel.offsetHeight - 8, anchorY - 24));
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
      ...((topView ? [0, 1, 0.001] : [-0.65, 1, 0.9]) as [number, number, number]),
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

function makeWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const colors = ["#bcb5ab", "#c7bfb5", "#b4ada4", "#d0c9bf", "#c1b8ad"];
  for (let plank = 0; plank < 16; plank++) {
    context.fillStyle = colors[plank % colors.length];
    context.fillRect(plank * 32, 0, 31, 512);
    for (let grain = 0; grain < 20; grain++) {
      context.strokeStyle = grain % 3 ? "#6b625f17" : "#fff5";
      context.beginPath();
      context.moveTo(plank * 32 + 3 + grain * 1.2, 0);
      context.bezierCurveTo(
        plank * 32 + grain * 1.2,
        180,
        plank * 32 + grain * 1.2 + 7,
        350,
        plank * 32 + 3 + grain * 1.2,
        512,
      );
      context.stroke();
    }
    context.fillStyle = "#80796e55";
    context.fillRect(plank * 32, (plank % 3) * 130 + 70, 32, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.6, 1.8);
  return texture;
}

function FloorBuilding({
  width,
  unitCount,
  arrangement,
  furnished,
  units,
  selectedUnitId,
  onSelect,
}: {
  width: number;
  unitCount: number;
  arrangement: UnitFloorArrangement;
  furnished: boolean;
  units: SceneUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
}) {
  const wood = useMemo(() => makeWoodTexture(), []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <>
      <Box
        position={[0, -0.24, unitCount > unitFloorColumns(unitCount, arrangement) ? 0 : 0.65]}
        size={[width + 0.25, 0.35, unitCount > unitFloorColumns(unitCount, arrangement) ? 16 : 8.6]}
        color="#d4dce6"
      />
      <mesh
        position={[0, -0.045, unitCount > unitFloorColumns(unitCount, arrangement) ? 0 : 4.1]}
        receiveShadow
      >
        <boxGeometry args={[width, 0.06, 1.7]} />
        <meshStandardMaterial map={wood} roughness={0.88} />
      </mesh>
      {unitCount <= unitFloorColumns(unitCount, arrangement) && (
        <>
          <Box position={[0, 0.22, 4.85]} size={[width + 0.2, 0.5, 0.14]} color="#eef0f2" />
          <Box position={[0, 0.5, 4.85]} size={[width + 0.2, 0.045, 0.15]} color="#3d4146" />
        </>
      )}
      {units.map((unit, index) => (
        <StudioUnit
          key={unit.id}
          unit={unit}
          wood={wood}
          furnished={furnished}
          position={unitRoomPosition(index, unitCount, arrangement)}
          selected={unit.id === selectedUnitId}
          onSelect={onSelect}
        />
      ))}
      {Array.from({ length: Math.max(0, unitCount - units.length) }, (_, index) => (
        <Box
          key={`hidden-${index}`}
          position={unitRoomPosition(units.length + index, unitCount, arrangement)}
          size={[4.2, 0.12, 6.8]}
          color="#d9dee4"
        />
      ))}
    </>
  );
}

function StudioUnit({
  furnished,
  unit,
  position,
  wood,
  selected,
  onSelect,
}: {
  furnished: boolean;
  unit: SceneUnit;
  position: [number, number, number];
  wood: Texture;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const choose = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta < 5) onSelect(unit.id);
  };
  return (
    <group position={position} rotation={[0, position[2] > 0 ? Math.PI : 0, 0]} onClick={choose}>
      {[-2.2, 2.2].map((x) => (
        <group key={x}>
          <Box position={[x, 0.38, 0]} size={[0.1, 0.76, 6.95]} color="#e9ecef" />
          <Box position={[x, 0.79, 0]} size={[0.12, 0.06, 6.96]} color="#34383c" />
        </group>
      ))}
      <mesh position={[0, -0.015, 0]} receiveShadow>
        <boxGeometry args={[4.32, 0.08, 6.9]} />
        <meshStandardMaterial map={wood} roughness={0.86} />
      </mesh>
      <Box
        position={[0, 0.025, 3.37]}
        size={[4.15, 0.025, 0.06]}
        color={
          selected
            ? getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
            : (statusColor[unit.status] ?? statusColor.inactive)
        }
      />
      <Box position={[0, 0.43, -3.45]} size={[4.4, 0.86, 0.13]} color="#edf0f3" />
      <Box position={[0, 2.12, -3.45]} size={[4.4, 0.25, 0.13]} color="#edf0f3" />
      <Box position={[0, 2.28, -3.45]} size={[4.42, 0.08, 0.15]} color="#34383c" />
      {[-2.05, 0, 2.05].map((x) => (
        <Box key={x} position={[x, 1.43, -3.45]} size={[0.12, 1.16, 0.18]} color="#dbe0e5" />
      ))}
      {[-1.03, 1.03].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.43, -3.43]}>
            <boxGeometry args={[1.91, 1.07, 0.035]} />
            <meshStandardMaterial
              color="#e5f1fa"
              emissive="#e4f1fb"
              emissiveIntensity={0.18}
              transparent
              opacity={0.58}
            />
          </mesh>
          <Box position={[x, 0.88, -3.33]} size={[2.01, 0.06, 0.3]} color="#fff" />
        </group>
      ))}
      {furnished && (
        <>
          <Bed position={[-0.93, 0, -1.34]} />
          <Desk position={[1.16, 0, -2.2]} />
          <Plant position={[-1.75, 0, -2.88]} />
        </>
      )}
      <Box position={[0.24, 0.97, 2.15]} size={[0.11, 1.94, 2.45]} color="#eef0f1" />
      <Box position={[0.24, 1.98, 2.15]} size={[0.14, 0.07, 2.46]} color="#3e4144" />
      {furnished && (
        <>
          <Bathroom />
          <Kitchen />
        </>
      )}
      <group position={[-1.7, 0, 3.34]} rotation={[0, -0.95, 0]}>
        <Box position={[0.4, 0.9, 0]} size={[0.8, 1.8, 0.065]} color="#f2f1ed" />
        <Box position={[0.72, 0.92, -0.05]} size={[0.08, 0.035, 0.035]} color="#adb2b5" />
      </group>
      <Box position={[1.2, 0.63, 3.43]} size={[1.88, 1.26, 0.11]} color="#edf0f1" />
      <Box position={[1.2, 1.29, 3.43]} size={[1.91, 0.06, 0.13]} color="#3b3d40" />
      <UnitPlaque unit={unit} selected={selected} />
    </group>
  );
}

function Bed({ position }: { position: [number, number, number] }) {
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
      <Box position={[0, 0.49, -1.15]} size={[1.94, 0.96, 0.1]} color="#c1c3c1" />
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

function Desk({ position }: { position: [number, number, number] }) {
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

function Kitchen() {
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

function Bathroom() {
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

function Plant({ position }: { position: [number, number, number] }) {
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

function UnitPlaque({ unit, selected }: { unit: SceneUnit; selected: boolean }) {
  const { size, camera } = useThree();
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 220;
    const context = canvas.getContext("2d")!;
    const theme = getComputedStyle(document.documentElement);
    context.fillStyle = selected ? theme.getPropertyValue("--primary").trim() : "#faf9f5";
    context.fillRect(0, 0, 512, 220);
    context.strokeStyle = selected ? theme.getPropertyValue("--primary").trim() : "#c4bbd6";
    context.lineWidth = 8;
    context.strokeRect(4, 4, 504, 212);
    context.textAlign = "center";
    context.fillStyle = selected
      ? theme.getPropertyValue("--primary-foreground").trim()
      : "#333842";
    context.font = "700 76px Arial";
    context.fillText(`Unit ${unit.code}`, 256, 96, 470);
    context.fillStyle = selected
      ? theme.getPropertyValue("--primary-foreground").trim()
      : (statusColor[unit.status] ?? statusColor.inactive);
    context.font = "600 56px Arial";
    context.fillText(unitStatusLabel(unit.status), 256, 176, 470);
    const labelTexture = new CanvasTexture(canvas);
    labelTexture.colorSpace = SRGBColorSpace;
    return labelTexture;
  }, [unit.code, unit.status, selected]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite
      name={`unit-label-${unit.id}`}
      position={[0, 2.7, 0]}
      scale={[
        (112 * 2) / (size.width * camera.projectionMatrix.elements[0]),
        (48 * 2) / (size.height * camera.projectionMatrix.elements[5]),
        1,
      ]}
      renderOrder={1000}
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

function Box({
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
      <meshStandardMaterial color={color} roughness={0.78} />
    </mesh>
  );
}
