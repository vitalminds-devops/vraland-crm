"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { CanvasTexture, SRGBColorSpace, type PerspectiveCamera } from "three";
import { Box, statusColor, useScreenScale } from "./floor-scene-kit";
import type { UnitGroup } from "../lib/sections";

/**
 * The picked unit's outline. Status itself shows on each unit's number chip, so the floor's
 * own colours stay clean.
 */
export function SelectedOutline({ w, h }: { w: number; h: number }) {
  const colour = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  const band = 0.2;
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box position={[0, 0.86, (side * h) / 2]} size={[w + band, 0.04, band]} color={colour} />
          <Box position={[(side * w) / 2, 0.86, 0]} size={[band, 0.04, h + band]} color={colour} />
        </group>
      ))}
    </>
  );
}

/** "1A" (and its section, "Sunrise", in its colour) on a small chip; painted once and shared. */
const chips = new Map<string, { texture: CanvasTexture; pixels: number }>();
function paintChip(code: string, colour: string, group?: UnitGroup | null) {
  const key = `${code}|${colour}|${group?.name ?? ""}|${group?.hex ?? ""}`;
  const cached = chips.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d")!;
  const font = '700 64px "Inter", "Segoe UI", sans-serif';
  const groupFont = '600 48px "Inter", "Segoe UI", sans-serif';
  c.font = font;
  const codeWidth = c.measureText(code).width;
  c.font = groupFont;
  const groupWidth = group ? c.measureText(group.name).width + 24 : 0;
  c.font = font;
  canvas.width = Math.ceil((codeWidth + groupWidth + 32) / 0.75);
  canvas.height = 96;
  c.fillStyle = "#ffffff";
  c.strokeStyle = colour;
  c.lineWidth = 6;
  c.beginPath();
  c.roundRect(3, 3, canvas.width - 6, 90, 45);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = colour;
  c.fillRect(0, 0, canvas.width / 4, canvas.height);
  c.restore();
  c.stroke();
  c.font = font;
  c.fillStyle = "#1f2937";
  c.textBaseline = "middle";
  c.fillText(code, canvas.width / 4 + 16, 52);
  if (group) {
    c.font = groupFont;
    c.fillStyle = group.hex;
    c.fillText(group.name, canvas.width / 4 + 16 + codeWidth + 24, 54);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const painted = { texture, pixels: canvas.width };
  chips.set(key, painted);
  return painted;
}

/** The unit's number in a small chip tucked into its own top-left corner, never over a neighbour. */
export function UnitChip({
  code,
  status,
  group,
  w,
  h,
}: {
  code: string;
  status: string;
  /** Its section, named beside the number in its colour. */
  group?: UnitGroup | null;
  w: number;
  h: number;
}) {
  const { texture, pixels } = paintChip(code, statusColor[status] ?? statusColor.inactive, group);
  // A fixed 24 px on screen, so the number reads whether the whole floor or one unit is in view.
  const screenScale = useScreenScale();
  return (
    <sprite
      position={[-w / 2 + 0.25, 2.5, -h / 2 + 0.25]}
      // Anchored by its top-left corner, so it grows into the unit, away from the walls.
      center={[0, 1]}
      scale={screenScale((24 * pixels) / 96, 24)}
      renderOrder={999}
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

/** Kept close to the bay surface so perspective doesn't move its number into a neighbour. */
export function ParkingChip({ code, status, w }: { code: string; status: string; w: number }) {
  const { texture, pixels } = paintChip(code, statusColor[status] ?? statusColor.inactive);
  const width = Math.min(w * 0.75, pixels / 120);
  return (
    <sprite
      position={[0, 0.18, 0]}
      scale={[width, (width * 96) / pixels, 1]}
      renderOrder={999}
      raycast={() => null}
    >
      <spriteMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/**
 * Tells the floor whether the view is close enough for room names to be readable: about 20
 * screen pixels per metre. Checked as the camera moves, and only reported when it flips.
 */
export function ZoomWatch({ onChange }: { onChange: (close: boolean) => void }) {
  const close = useRef<boolean | null>(null);
  useFrame(({ camera, size }) => {
    const perspective = camera as PerspectiveCamera;
    const visible = 2 * perspective.position.y * Math.tan((perspective.fov * Math.PI) / 360);
    const next = size.height / visible >= 20;
    if (next === close.current) return;
    close.current = next;
    onChange(next);
  });
  return null;
}
