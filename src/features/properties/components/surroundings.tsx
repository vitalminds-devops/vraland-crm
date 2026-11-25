"use client";

import { useEffect, useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Surroundings as Kind } from "../lib/surroundings";
import { Box } from "./floor-scene-kit";

/** A ground tile with evenly scattered specks, the same on every render. */
function drawGround(base: string, specks: [string, string]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = base;
  c.fillRect(0, 0, 128, 128);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    c.fillStyle = next() > 0.5 ? specks[0] : specks[1];
    c.fillRect(next() * 128, next() * 128, 2, 2);
  }
  return canvas;
}

function useGround(base: string, specks: [string, string], size: number, metres: number) {
  const texture = useMemo(() => {
    const map = new CanvasTexture(drawGround(base, specks));
    map.colorSpace = SRGBColorSpace;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(size / metres, size / metres);
    return map;
  }, [base, specks, size, metres]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

const grounds: Record<Kind, { base: string; specks: [string, string] }> = {
  city: { base: "#55595f", specks: ["#62666c", "#4a4e54"] },
  suburb: { base: "#79a95a", specks: ["#8fbd68", "#6a9a4e"] },
  industrial: { base: "#a3a29c", specks: ["#b1b0aa", "#94938d"] },
  rural: { base: "#8f7350", specks: ["#9c805c", "#7f6545"] },
};

/**
 * The area around the building, by property type: a city block, a suburban garden, a warehouse
 * yard or farmland. `width` and `depth` are the building's slab; `centre` is where it sits.
 */
export function Surroundings({
  kind,
  width,
  depth,
  centre,
}: {
  kind: Kind;
  width: number;
  depth: number;
  centre: [number, number];
}) {
  const size = Math.max(width, depth) + 60;
  const ground = useGround(grounds[kind].base, grounds[kind].specks, size, 4);
  const [cx, cz] = centre;
  const w2 = width / 2;
  const d2 = depth / 2;

  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, -0.43, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      {kind === "city" && <City w2={w2} d2={d2} />}
      {kind === "suburb" && <Suburb w2={w2} d2={d2} />}
      {kind === "industrial" && <Industrial w2={w2} d2={d2} />}
      {kind === "rural" && <Rural w2={w2} d2={d2} />}
    </group>
  );
}

type Half = { w2: number; d2: number };

/** A flat strip on the ground: sidewalks, lane marks, parking lines, crop rows. */
function Strip({
  x,
  z,
  w,
  d,
  color,
  y = -0.4,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  y?: number;
}) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function City({ w2, d2 }: Half) {
  const walk = 2.2;
  const road = 7;
  const outerX = w2 + walk + road;
  const outerZ = d2 + walk + road;
  const dashes = (from: number, to: number) => {
    const marks: number[] = [];
    for (let at = from; at <= to; at += 3) marks.push(at);
    return marks;
  };
  const lamps: [number, number][] = [];
  for (let x = -w2; x <= w2; x += 6) lamps.push([x, -d2 - walk + 0.4], [x, d2 + walk - 0.4]);

  return (
    <>
      {/* Sidewalk ring around the building. */}
      <Strip x={0} z={0} w={(w2 + walk) * 2} d={(d2 + walk) * 2} color="#cdc8bf" y={-0.41} />
      {/* Lane marks down the middle of each road. */}
      {dashes(-outerX, outerX).map((x) => (
        <group key={`dx${x}`}>
          <Strip x={x} z={-d2 - walk - road / 2} w={1.4} d={0.15} color="#f4f1e8" y={-0.415} />
          <Strip x={x} z={d2 + walk + road / 2} w={1.4} d={0.15} color="#f4f1e8" y={-0.415} />
        </group>
      ))}
      {dashes(-outerZ, outerZ).map((z) => (
        <group key={`dz${z}`}>
          <Strip x={-w2 - walk - road / 2} z={z} w={0.15} d={1.4} color="#f4f1e8" y={-0.415} />
          <Strip x={w2 + walk + road / 2} z={z} w={0.15} d={1.4} color="#f4f1e8" y={-0.415} />
        </group>
      ))}
      {/* Crosswalks at the front corners. */}
      {[-1, 1].flatMap((side) =>
        Array.from({ length: 6 }, (_, n) => (
          <Strip
            key={`cw${side}${n}`}
            x={side * (w2 - 1.5) + (n - 2.5) * 0.7}
            z={d2 + walk + road / 2}
            w={0.4}
            d={road - 1}
            color="#eceae2"
            y={-0.412}
          />
        )),
      )}
      {lamps.map(([x, z], n) => (
        <group key={`l${n}`} position={[x, -0.4, z]}>
          <mesh position={[0, 1.1, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 2.2, 8]} />
            <meshStandardMaterial color="#3b3f45" />
          </mesh>
          <mesh position={[0, 2.25, 0]}>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshStandardMaterial color="#fff2c4" emissive="#ffe39a" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Suburb({ d2 }: Half) {
  const street = d2 + 6;
  return (
    <>
      {/* A lawn with a quiet street along the front, its sidewalk and a path to the door. */}
      <Strip x={0} z={street + 3} w={200} d={6} color="#5d6167" />
      <Strip x={0} z={street - 0.6} w={200} d={1.6} color="#d6d1c8" />
      <Strip x={0} z={d2 + 2.6} w={1.6} d={4.4} color="#d6d1c8" />
    </>
  );
}

function Industrial({ w2, d2 }: Half) {
  const yard = 12;
  const bays: number[] = [];
  for (let x = -w2 + 1.5; x <= w2 - 1.5; x += 3) bays.push(x);
  const posts: [number, number][] = [];
  for (let x = -w2 - yard; x <= w2 + yard; x += 3) posts.push([x, -d2 - yard], [x, d2 + yard]);
  for (let z = -d2 - yard; z <= d2 + yard; z += 3) posts.push([-w2 - yard, z], [w2 + yard, z]);
  return (
    <>
      <Strip x={0} z={0} w={(w2 + yard) * 2} d={(d2 + yard) * 2} color="#b7b5ae" y={-0.415} />
      {/* Parking bays and a loading lane in front. */}
      {bays.map((x) => (
        <Strip key={`b${x}`} x={x} z={d2 + 4} w={0.12} d={5} color="#f2d14b" y={-0.41} />
      ))}
      <Strip x={0} z={d2 + 9} w={(w2 + yard) * 2 - 2} d={0.25} color="#f2d14b" y={-0.41} />
      {[-0.6, 0.6].map((f) => (
        <Box
          key={`p${f}`}
          position={[w2 * f, -0.2, -d2 - 3]}
          size={[1.2, 0.4, 1.2]}
          color="#a9794a"
        />
      ))}
      {posts.map(([x, z], n) => (
        <mesh key={`fp${n}`} position={[x, 0.3, z]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
          <meshStandardMaterial color="#6f747a" />
        </mesh>
      ))}
    </>
  );
}

function Rural({ w2, d2 }: Half) {
  const rows: number[] = [];
  for (let z = -d2 - 18; z <= d2 + 18; z += 1.6) rows.push(z);
  const posts: [number, number][] = [];
  for (let x = -w2 - 4; x <= w2 + 4; x += 3) posts.push([x, -d2 - 4], [x, d2 + 4]);
  for (let z = -d2 - 4; z <= d2 + 4; z += 3) posts.push([-w2 - 4, z], [w2 + 4, z]);
  return (
    <>
      {/* Crop rows on both sides, a grass yard and a dirt track to the front. */}
      {rows.map((z) => (
        <group key={`row${z}`}>
          <Strip x={-w2 - 14} z={z} w={18} d={0.7} color="#6f9a43" y={-0.41} />
          <Strip x={w2 + 14} z={z} w={18} d={0.7} color="#6f9a43" y={-0.41} />
        </group>
      ))}
      <Strip x={0} z={0} w={(w2 + 4) * 2} d={(d2 + 4) * 2} color="#86ad5c" y={-0.415} />
      <Strip x={0} z={d2 + 14} w={3} d={20} color="#b08f62" y={-0.41} />
      {posts.map(([x, z], n) => (
        <mesh key={`rp${n}`} position={[x, 0.15, z]} castShadow>
          <boxGeometry args={[0.15, 1.1, 0.15]} />
          <meshStandardMaterial color="#8a6a45" />
        </mesh>
      ))}
    </>
  );
}
