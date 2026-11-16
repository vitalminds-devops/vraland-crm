"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Point = [number, number];

// Isometric box: x runs along the front-left face, y along the front-right face.
const WIDTH = 6;
const DEPTH = 4;
const STOREY = 1.15;
const SCALE = 22;
const COS = Math.cos(Math.PI / 6);

function project(x: number, y: number, z: number): Point {
  return [(x - y) * COS * SCALE, ((x + y) * 0.5 - z) * SCALE];
}

function points(...corners: [number, number, number][]): string {
  return corners
    .map((corner) => project(...corner))
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/** Window polygons for `count` units spread along one face of a storey. */
function windows(count: number, face: "left" | "right", z0: number): string[] {
  const length = face === "left" ? WIDTH : DEPTH;
  const cell = length / Math.max(count, 1);
  const bottom = z0 + STOREY * 0.28;
  const top = z0 + STOREY * 0.78;
  return Array.from({ length: count }, (_, index) => {
    const a = cell * (index + 0.22);
    const b = cell * (index + 0.78);
    return face === "left"
      ? points([a, DEPTH, bottom], [b, DEPTH, bottom], [b, DEPTH, top], [a, DEPTH, top])
      : points([WIDTH, a, bottom], [WIDTH, b, bottom], [WIDTH, b, top], [WIDTH, a, top]);
  });
}

/**
 * The property as a 3D building: one storey per floor, one window per unit.
 * Lit windows are units the person can see; clicking a storey opens that floor.
 * `windowClass` and `caption` repaint it for other uses, such as unit status.
 */
export function AccessTower({
  title,
  floors,
  units,
  isGranted,
  activeFloorId,
  onPickFloor,
  windowClass,
  countNoun = "visible",
  caption,
  mini = false,
  className,
}: {
  title: string;
  /** Lowest floor first. */
  floors: { id: string; label: string }[];
  units: { id: string; code: string; floorId: string }[];
  isGranted: (unitId: string) => boolean;
  activeFloorId: string | null;
  /** Leave out with `mini`; the drawing is then just a picture. */
  onPickFloor?: (floorId: string) => void;
  /** Fill for a unit's window; lit or dark by `isGranted` when left out. */
  windowClass?: (unitId: string) => string;
  /** What a counted (`isGranted`) unit is, for screen readers: "visible", "available". */
  countNoun?: string;
  caption?: ReactNode;
  /** Small picture only: no floor labels, legend or clicking. */
  mini?: boolean;
  className?: string;
}) {
  const roof = floors.length * STOREY;
  const [minX] = project(0, DEPTH + 1.5, 0);
  const [maxX] = project(WIDTH + 1.5, 0, 0);
  const minY = Math.min(project(0, 0, roof)[1], project(-1.5, -1.5, 0)[1]);
  const [, maxY] = project(WIDTH + 1.5, DEPTH + 1.5, 0);
  const pad = 12;
  // Floor labels sit left of the building.
  const labelRoom = mini ? 0 : 64;
  const interactive = !mini && onPickFloor;

  const lit = units.filter((unit) => isGranted(unit.id)).length;

  return (
    <figure
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-sky-100/70 via-card to-card dark:from-slate-900 dark:via-card",
        className,
      )}
    >
      <svg
        role="img"
        aria-label={`${title}: ${lit} of ${units.length} units ${countNoun}`}
        viewBox={`${minX - pad - labelRoom} ${minY - pad} ${maxX - minX + pad * 2 + labelRoom} ${maxY - minY + pad * 2}`}
        className={cn("mx-auto w-full flex-1", mini ? "max-h-40 p-3" : "max-h-[26rem] px-4 pt-4")}
      >
        {/* Lot */}
        <polygon
          points={points(
            [-1.5, -1.5, 0],
            [WIDTH + 1.5, -1.5, 0],
            [WIDTH + 1.5, DEPTH + 1.5, 0],
            [-1.5, DEPTH + 1.5, 0],
          )}
          className="fill-emerald-500/15 stroke-emerald-600/30"
          strokeWidth={1}
        />

        {floors.map((floor, level) => {
          const z0 = level * STOREY;
          const z1 = z0 + STOREY;
          const onFloor = units.filter((unit) => unit.floorId === floor.id);
          const granted = onFloor.filter((unit) => isGranted(unit.id));
          const state =
            onFloor.length && granted.length === onFloor.length
              ? "full"
              : granted.length
                ? "part"
                : "none";
          const active = floor.id === activeFloorId;
          const leftCount = Math.ceil(onFloor.length / 2);
          const leftWindows = windows(leftCount, "left", z0);
          const rightWindows = windows(onFloor.length - leftCount, "right", z0);
          const [labelX, labelY] = project(0, DEPTH, z0 + STOREY / 2);

          return (
            <g
              key={floor.id}
              {...(interactive && {
                role: "button",
                tabIndex: 0,
                "aria-label": `${floor.label}: ${granted.length} of ${onFloor.length} units ${countNoun}`,
                "aria-pressed": active,
                onClick: () => onPickFloor(floor.id),
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPickFloor(floor.id);
                  }
                },
              })}
              className={cn("group outline-none", interactive && "cursor-pointer")}
            >
              <title>{floor.label}</title>
              <polygon
                points={points(
                  [0, DEPTH, z0],
                  [WIDTH, DEPTH, z0],
                  [WIDTH, DEPTH, z1],
                  [0, DEPTH, z1],
                )}
                className={cn(
                  "transition-colors",
                  state === "none" ? "fill-slate-200 dark:fill-slate-700" : "fill-primary/30",
                  state === "full" && "fill-primary/45",
                  interactive && "group-hover:fill-primary/55 group-focus-visible:fill-primary/55",
                )}
              />
              <polygon
                points={points(
                  [WIDTH, 0, z0],
                  [WIDTH, DEPTH, z0],
                  [WIDTH, DEPTH, z1],
                  [WIDTH, 0, z1],
                )}
                className={cn(
                  "transition-colors",
                  state === "none" ? "fill-slate-300 dark:fill-slate-800" : "fill-primary/50",
                  state === "full" && "fill-primary/65",
                  interactive && "group-hover:fill-primary/75 group-focus-visible:fill-primary/75",
                )}
              />
              {/* Slab line between storeys */}
              <polyline
                points={points([0, DEPTH, z0], [WIDTH, DEPTH, z0], [WIDTH, 0, z0])}
                className="fill-none stroke-background"
                strokeWidth={1.5}
              />
              {[...leftWindows, ...rightWindows].map((shape, index) => {
                const unit = onFloor[index];
                return (
                  <polygon
                    key={unit.id}
                    points={shape}
                    className={
                      windowClass?.(unit.id) ??
                      (isGranted(unit.id)
                        ? "fill-primary stroke-primary/60"
                        : "fill-slate-500/40 stroke-slate-600/20 dark:fill-slate-950/60")
                    }
                    strokeWidth={0.75}
                  >
                    <title>
                      {windowClass
                        ? `Unit ${unit.code}`
                        : `Unit ${unit.code}${isGranted(unit.id) ? "" : " (hidden)"}`}
                    </title>
                  </polygon>
                );
              })}
              {active && (
                <polyline
                  points={points(
                    [0, DEPTH, z0],
                    [WIDTH, DEPTH, z0],
                    [WIDTH, 0, z0],
                    [WIDTH, 0, z1],
                    [WIDTH, DEPTH, z1],
                    [0, DEPTH, z1],
                    [0, DEPTH, z0],
                  )}
                  className="fill-none stroke-primary"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}
              {!mini && (
                <text
                  x={labelX - 8}
                  y={labelY}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={cn(
                    "text-[11px] tabular-nums",
                    active ? "fill-primary font-semibold" : "fill-muted-foreground",
                  )}
                >
                  {floor.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Roof with a parapet */}
        <polygon
          points={points([0, 0, roof], [WIDTH, 0, roof], [WIDTH, DEPTH, roof], [0, DEPTH, roof])}
          className="fill-slate-100 stroke-slate-400/60 dark:fill-slate-600"
          strokeWidth={1}
        />
        <polygon
          points={points(
            [0.5, 0.5, roof],
            [WIDTH - 0.5, 0.5, roof],
            [WIDTH - 0.5, DEPTH - 0.5, roof],
            [0.5, DEPTH - 0.5, roof],
          )}
          className="fill-slate-200 dark:fill-slate-700"
        />
      </svg>

      {!mini && (
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 bg-card/80 px-3 py-2 text-[11.5px] text-muted-foreground">
          {caption ?? (
            <>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-sm bg-primary ring-1 ring-primary/60"
                  />
                  Visible
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2.5 rounded-sm bg-slate-500/40" />
                  Hidden
                </span>
              </span>
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">{lit}</span> of {units.length} units
              </span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
