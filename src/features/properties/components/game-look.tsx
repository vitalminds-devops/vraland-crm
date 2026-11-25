"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { roomLabels, type RoomKind } from "../lib/floor-layout";

/**
 * The life-sim game look for designed floors: each room gets its own floor finish and a painted
 * name. The area around the building is in surroundings.tsx.
 */

type Finish = "wood" | "tile" | "checker" | "carpet" | "deck";

const finishOf: Record<RoomKind, Finish> = {
  bedroom: "carpet",
  maids: "carpet",
  door: "wood",
  bathroom: "tile",
  powder: "tile",
  laundry: "tile",
  kitchen: "checker",
  balcony: "deck",
  living: "wood",
  dining: "wood",
  study: "wood",
  closet: "wood",
  foyer: "wood",
  storage: "wood",
};

/** Metres one copy of each pattern covers, so planks and tiles keep a real size. */
const finishSize: Record<Finish, number> = {
  wood: 2.4,
  tile: 1.2,
  checker: 1.2,
  carpet: 2,
  deck: 2.4,
};

function draw(finish: Finish): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  // Small fixed jitter instead of Math.random, so every render paints the same floor.
  const jitter = (i: number) => ((i * 9301 + 49297) % 233280) / 233280;
  if (finish === "wood" || finish === "deck") {
    const tones =
      finish === "wood"
        ? ["#8c5c38", "#966540", "#815434", "#9c6c46", "#8f603b"]
        : ["#7a5236", "#6c4830", "#86603f", "#71503a"];
    const plank = finish === "wood" ? 32 : 42;
    for (let x = 0, i = 0; x < 256; x += plank, i++) {
      c.fillStyle = tones[i % tones.length];
      c.fillRect(x, 0, plank - 2, 256);
      c.fillStyle = "#00000022";
      c.fillRect(x + plank - 2, 0, 2, 256);
      c.fillRect(x, Math.floor(jitter(i) * 200) + 20, plank - 2, 2);
      for (let g = 0; g < 6; g++) {
        c.fillStyle = g % 2 ? "#ffffff10" : "#00000010";
        c.fillRect(x + 4 + g * (plank / 7), 0, 1, 256);
      }
    }
  } else if (finish === "tile" || finish === "checker") {
    const size = 32;
    for (let y = 0; y < 256; y += size)
      for (let x = 0; x < 256; x += size) {
        const dark = finish === "checker" && (x / size + y / size) % 2 === 1;
        c.fillStyle = dark ? "#cfc6b8" : finish === "checker" ? "#f1ece3" : "#e8eef1";
        c.fillRect(x, y, size, size);
        c.strokeStyle = finish === "tile" ? "#b9c6cc" : "#00000014";
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, size - 2, size - 2);
      }
  } else {
    c.fillStyle = "#7f9cc0";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      c.fillStyle = jitter(i) > 0.5 ? "#ffffff14" : "#1d335014";
      c.fillRect(jitter(i * 7) * 256, jitter(i * 13) * 256, 2, 2);
    }
  }
  return canvas;
}

/**
 * One painted texture per floor finish, shared by every room: rooms only differ in how often it
 * repeats, so each takes a clone, which reuses the same image on the graphics card.
 */
const finishes = new Map<Finish, CanvasTexture>();
function finishTexture(finish: Finish) {
  let base = finishes.get(finish);
  if (!base) {
    base = new CanvasTexture(draw(finish));
    base.colorSpace = SRGBColorSpace;
    base.wrapS = base.wrapT = RepeatWrapping;
    finishes.set(finish, base);
  }
  return base;
}

function useFinish(finish: Finish, w: number, h: number) {
  const texture = useMemo(() => {
    const map = finishTexture(finish).clone();
    map.repeat.set(w / finishSize[finish], h / finishSize[finish]);
    return map;
  }, [finish, w, h]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** The floor every unit stands on: warm planks. */
export function UnitFloor({ width, depth }: { width: number; depth: number }) {
  const map = useFinish("wood", width, depth);
  return (
    <mesh position={[width / 2, -0.015, depth / 2]} receiveShadow>
      <boxGeometry args={[width, 0.08, depth]} />
      <meshStandardMaterial map={map} roughness={0.8} />
    </mesh>
  );
}

/** A room's own floor finish, laid just above the unit's planks. */
export function RoomFloor({ kind, w, h }: { kind: RoomKind; w: number; h: number }) {
  const finish = finishOf[kind];
  const map = useFinish(finish, w, h);
  if (finish === "wood") return null;
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w - 0.04, h - 0.04]} />
      <meshStandardMaterial map={map} roughness={finish === "tile" ? 0.4 : 0.9} />
    </mesh>
  );
}

/**
 * The room's name painted over it, like a game floor plan. A sprite, so it stays upright
 * however the unit is turned or mirrored, and never catches the pointer.
 */
export function RoomName({ kind, w }: { kind: RoomKind; w: number }) {
  return <PaintedText text={roomLabels[kind]} w={w} />;
}

/** Text painted over the floor, such as a room's name or a parking slot's number. */
/**
 * Painted names, one per distinct text and kept for the session: a floor repeats the same few
 * names ("Bedroom", "P12"…), so painting each once makes switching floors much lighter.
 * shortcut: never freed, which is fine for a few hundred short labels; evict if that grows.
 */
const paintedTexts = new Map<string, { texture: CanvasTexture; pixels: number }>();
function paintText(text: string) {
  const cached = paintedTexts.get(text);
  if (cached) return cached;
  {
    const canvas = document.createElement("canvas");
    const c = canvas.getContext("2d")!;
    const font = '500 56px "Inter", "Segoe UI", sans-serif';
    c.font = font;
    canvas.width = Math.ceil(c.measureText(text).width + 40);
    canvas.height = 88;
    c.font = font;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#fffdf8";
    c.beginPath();
    c.roundRect(4, 4, canvas.width - 8, 80, 12);
    c.fill();
    c.fillStyle = "#1f2937";
    c.fillText(text, canvas.width / 2, 46);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    const painted = { texture: map, pixels: canvas.width };
    paintedTexts.set(text, painted);
    return painted;
  }
}

export function PaintedText({ text, w }: { text: string; w: number }) {
  const { texture, pixels } = paintText(text);
  // Quieter than the unit tags: names guide the eye without covering the furniture.
  const width = Math.min(w * 0.85, pixels / 130);
  return (
    <sprite
      position={[0, 2.4, 0]}
      scale={[width, (width * 88) / pixels, 1]}
      renderOrder={998}
      raycast={() => null}
    >
      <spriteMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
