import type { ReactNode } from "react";
import {
  designBounds,
  footprint,
  roomLabels,
  spaceLabels,
  type LayoutItem,
  type RoomKind,
  type SpaceKind,
  type UnitDesign,
} from "../lib/floor-layout";

/**
 * The ready-made top-view drawings. Everything is in metres; strokes stay one pixel at any zoom.
 * Furniture stands against the piece's top wall, so rotating a piece turns its furniture too.
 */

const line = {
  vectorEffect: "non-scaling-stroke",
  strokeWidth: 1,
  className: "fill-card stroke-foreground/45",
} as const;
const mark = { ...line, className: "fill-none stroke-foreground/35" } as const;

const roomFloor: Record<RoomKind, string> = {
  bedroom: "fill-amber-50 dark:fill-amber-950/40",
  bathroom: "fill-sky-50 dark:fill-sky-950/40",
  kitchen: "fill-stone-100 dark:fill-stone-800/60",
  living: "fill-orange-50/70 dark:fill-orange-950/30",
  dining: "fill-orange-50/70 dark:fill-orange-950/30",
  balcony: "fill-emerald-50 dark:fill-emerald-950/40",
  closet: "fill-stone-100 dark:fill-stone-800/60",
  foyer: "fill-stone-50 dark:fill-stone-900/60",
  study: "fill-orange-50/70 dark:fill-orange-950/30",
  laundry: "fill-sky-50 dark:fill-sky-950/40",
  powder: "fill-sky-50 dark:fill-sky-950/40",
  storage: "fill-stone-100 dark:fill-stone-800/60",
  maids: "fill-amber-50 dark:fill-amber-950/40",
  door: "fill-none",
};

/** Moves a piece's own drawing (0…w, 0…h) to its place, turned and mirrored. */
export function itemTransform(item: LayoutItem & { flip?: boolean }): string {
  const [fw, fh] = footprint(item);
  return `translate(${item.x + fw / 2} ${item.y + fh / 2}) rotate(${item.rotation}) scale(${item.flip ? -1 : 1} 1) translate(${-item.w / 2} ${-item.h / 2})`;
}

function Bedroom({ w, h }: { w: number; h: number }) {
  const bw = Math.max(0.8, Math.min(1.6, w - 1.1));
  const bl = Math.max(1, Math.min(2, h - 0.6));
  const x = (w - bw) / 2;
  const pillows = bw >= 1.2 ? 2 : 1;
  const stand = 0.45;
  return (
    <g>
      <rect x={x} y={0.1} width={bw} height={bl} rx={0.08} {...line} />
      {Array.from({ length: pillows }, (_, i) => (
        <rect
          key={i}
          x={x + 0.1 + (i * (bw - 0.2)) / pillows}
          y={0.2}
          width={(bw - 0.2) / pillows - 0.06}
          height={0.32}
          rx={0.06}
          {...line}
        />
      ))}
      <path d={`M${x} ${0.1 + bl * 0.42} H${x + bw}`} {...mark} />
      {x >= stand + 0.1 && (
        <>
          <rect x={x - stand - 0.05} y={0.1} width={stand} height={stand} rx={0.04} {...line} />
          <rect x={x + bw + 0.05} y={0.1} width={stand} height={stand} rx={0.04} {...line} />
        </>
      )}
    </g>
  );
}

function Bathroom({ w, h }: { w: number; h: number }) {
  const shower = Math.min(0.9, w * 0.5, h * 0.45);
  return (
    <g>
      <rect x={0.12} y={0.06} width={0.42} height={0.18} rx={0.03} {...line} />
      <ellipse cx={0.33} cy={0.5} rx={0.19} ry={0.26} {...line} />
      {w >= 1.3 && (
        <>
          <rect x={w - 0.62} y={0.06} width={0.55} height={0.42} rx={0.06} {...line} />
          <ellipse cx={w - 0.345} cy={0.28} rx={0.18} ry={0.13} {...mark} />
        </>
      )}
      {h >= 1.5 && (
        <>
          <rect x={w - shower} y={h - shower} width={shower} height={shower} {...line} />
          <path d={`M${w - shower} ${h - shower} L${w} ${h}`} {...mark} />
          <circle cx={w - shower / 2} cy={h - shower / 2} r={0.05} {...mark} />
        </>
      )}
    </g>
  );
}

function Kitchen({ w, h }: { w: number; h: number }) {
  const depth = Math.min(0.6, h * 0.4);
  const stoveX = Math.max(0.15, w * 0.55);
  return (
    <g>
      <rect x={0} y={0} width={w} height={depth} {...line} />
      <rect
        x={Math.max(0.1, w * 0.12)}
        y={0.1}
        width={0.5}
        height={depth - 0.2}
        rx={0.05}
        {...mark}
      />
      {[0, 1].map((col) =>
        [0, 1].map((row) => (
          <circle
            key={`${col}${row}`}
            cx={stoveX + col * 0.28}
            cy={0.16 + row * (depth - 0.32)}
            r={0.09}
            {...mark}
          />
        )),
      )}
      {w >= 2.4 && (
        <>
          <rect x={w - 0.72} y={0.02} width={0.7} height={0.68} {...line} />
          <path d={`M${w - 0.72} 0.25 H${w - 0.02}`} {...mark} />
        </>
      )}
    </g>
  );
}

function Living({ w, h }: { w: number; h: number }) {
  const sw = Math.max(1, Math.min(2.2, w - 0.4));
  const sx = (w - sw) / 2;
  const sy = Math.max(0.9, h - 0.95);
  return (
    <g>
      <rect
        x={(w - Math.min(1.4, w - 0.4)) / 2}
        y={0.1}
        width={Math.min(1.4, w - 0.4)}
        height={0.08}
        {...line}
      />
      <rect x={sx} y={sy} width={sw} height={0.85} rx={0.1} {...line} />
      <path d={`M${sx + 0.15} ${sy + 0.25} H${sx + sw - 0.15}`} {...mark} />
      <rect x={sx} y={sy} width={0.15} height={0.85} rx={0.05} {...mark} />
      <rect x={sx + sw - 0.15} y={sy} width={0.15} height={0.85} rx={0.05} {...mark} />
      {sy > 1.4 && (
        <rect x={(w - 1) / 2} y={sy - 0.75} width={1} height={0.5} rx={0.08} {...line} />
      )}
    </g>
  );
}

function Dining({ w, h }: { w: number; h: number }) {
  const tw = Math.max(0.7, Math.min(1.6, w - 1.2));
  const th = Math.max(0.6, Math.min(0.9, h - 1.2));
  const x = (w - tw) / 2;
  const y = (h - th) / 2;
  const chair = 0.42;
  return (
    <g>
      {[0.25, 0.75].flatMap((at) =>
        [y - chair - 0.04, y + th + 0.04].map((cy) => (
          <rect
            key={`${at}${cy}`}
            x={x + tw * at - chair / 2}
            y={cy}
            width={chair}
            height={chair}
            rx={0.06}
            {...line}
          />
        )),
      )}
      <rect x={x} y={y} width={tw} height={th} rx={0.06} {...line} />
    </g>
  );
}

function Balcony({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <path d={`M0 ${h - 0.08} H${w}`} {...mark} />
      <circle cx={w / 2} cy={h / 2} r={Math.min(0.35, h * 0.25)} {...line} />
      {w >= 2.2 && (
        <>
          <rect x={w / 2 - 0.95} y={h / 2 - 0.22} width={0.44} height={0.44} rx={0.08} {...line} />
          <rect x={w / 2 + 0.51} y={h / 2 - 0.22} width={0.44} height={0.44} rx={0.08} {...line} />
        </>
      )}
      <circle
        cx={0.35}
        cy={0.35}
        r={0.22}
        className="fill-emerald-200/70 stroke-emerald-700/40 dark:fill-emerald-800/50"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1}
      />
    </g>
  );
}

function Closet({ w, h }: { w: number; h: number }) {
  const hangers = Math.max(2, Math.floor((w - 0.2) / 0.25));
  return (
    <g>
      <path d={`M0.1 ${h / 2} H${w - 0.1}`} {...mark} />
      {Array.from({ length: hangers }, (_, i) => {
        const x = 0.15 + (i * (w - 0.3)) / (hangers - 1);
        return <path key={i} d={`M${x} ${h / 2 - 0.25} V${h / 2 + 0.25}`} {...mark} />;
      })}
    </g>
  );
}

function Foyer({ w, h }: { w: number; h: number }) {
  return (
    <rect
      x={Math.max(0.1, w / 2 - 0.4)}
      y={Math.max(0.1, h - 0.6)}
      width={Math.min(0.8, w - 0.2)}
      height={0.45}
      rx={0.06}
      {...mark}
    />
  );
}

function Study({ w, h }: { w: number; h: number }) {
  const dw = Math.min(1.4, w - 0.3);
  return (
    <g>
      <rect x={(w - dw) / 2} y={0.08} width={dw} height={0.6} rx={0.04} {...line} />
      <rect x={w / 2 - 0.22} y={0.82} width={0.44} height={0.44} rx={0.08} {...line} />
      {h >= 2 && (
        <rect x={0.08} y={h - 0.45} width={Math.min(1.2, w - 0.16)} height={0.35} {...mark} />
      )}
    </g>
  );
}

function Laundry({ w }: { w: number; h: number }) {
  const machines = w >= 1.4 ? [0.1, 0.75] : [0.1];
  return (
    <g>
      {machines.map((x) => (
        <g key={x}>
          <rect x={x} y={0.08} width={0.6} height={0.6} rx={0.05} {...line} />
          <circle cx={x + 0.3} cy={0.4} r={0.2} {...mark} />
        </g>
      ))}
    </g>
  );
}

function Powder({ w }: { w: number; h: number }) {
  return (
    <g>
      <rect x={0.12} y={0.06} width={0.42} height={0.18} rx={0.03} {...line} />
      <ellipse cx={0.33} cy={0.5} rx={0.19} ry={0.26} {...line} />
      {w >= 1.1 && (
        <>
          <rect x={w - 0.5} y={0.06} width={0.42} height={0.36} rx={0.06} {...line} />
          <ellipse cx={w - 0.29} cy={0.24} rx={0.13} ry={0.1} {...mark} />
        </>
      )}
    </g>
  );
}

function Storage({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect x={0.05} y={0.05} width={w - 0.1} height={0.4} {...line} />
      <rect x={0.05} y={0.5} width={0.4} height={Math.max(0.2, h - 0.55)} {...line} />
      <path d={`M0.05 0.25 H${w - 0.05} M0.25 0.5 V${h - 0.05}`} {...mark} />
    </g>
  );
}

function Maids({ w, h }: { w: number; h: number }) {
  const bw = Math.min(0.95, w - 0.3);
  const bl = Math.min(1.9, h - 0.3);
  return (
    <g>
      <rect x={0.1} y={0.1} width={bw} height={bl} rx={0.06} {...line} />
      <rect x={0.2} y={0.18} width={bw - 0.2} height={0.3} rx={0.06} {...mark} />
      <path d={`M0.1 ${0.1 + bl * 0.42} H${0.1 + bw}`} {...mark} />
    </g>
  );
}

/**
 * A door as plans draw it: the gap in the wall along its bottom edge, the leaf standing open
 * from the hinge at the bottom left, and the arc it swings through.
 */
function Door({ w, h }: { w: number; h: number }) {
  const leaf = Math.min(w, h);
  return (
    <g>
      <rect x={0} y={h - 0.08} width={w} height={0.16} className="fill-background" />
      <path
        d={`M0 ${h} V${h - leaf}`}
        className="stroke-amber-700"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M0 ${h - leaf} A${leaf} ${leaf} 0 0 1 ${leaf} ${h}`}
        className="fill-none stroke-foreground/50"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

const furniture: Record<RoomKind, (size: { w: number; h: number }) => ReactNode> = {
  bedroom: Bedroom,
  bathroom: Bathroom,
  kitchen: Kitchen,
  living: Living,
  dining: Dining,
  balcony: Balcony,
  closet: Closet,
  foyer: Foyer,
  study: Study,
  laundry: Laundry,
  powder: Powder,
  storage: Storage,
  maids: Maids,
  door: Door,
};

/** One room with its furniture, drawn at its own size (0…w, 0…h). */
export function RoomArt({
  kind,
  w,
  h,
  label = false,
  rotation = 0,
  flip = false,
}: {
  kind: RoomKind;
  w: number;
  h: number;
  label?: boolean;
  /** How the room is turned and mirrored, so its name can stay the right way up. */
  rotation?: number;
  flip?: boolean;
}) {
  const Furniture = furniture[kind];
  if (kind === "door") return <Door w={w} h={h} />;
  return (
    <g>
      <rect
        width={w}
        height={h}
        className={`${roomFloor[kind]} stroke-foreground/50`}
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.25}
      />
      <Furniture w={w} h={h} />
      {/* Small rooms leave their name off rather than spill out of their walls. */}
      {label && w >= 1.4 && h >= 1 && (
        // A room turned upside down spins its name back round, so it reads upright at the top.
        // A mirrored room mirrors its name back, so it never reads backwards.
        <g
          transform={
            [
              flip ? `translate(${w} 0) scale(-1 1)` : "",
              rotation === 180 ? `rotate(180 ${w / 2} ${h / 2})` : "",
            ].join(" ") || undefined
          }
        >
          <PlanText
            x={w / 2}
            y={h - 0.16}
            size={Math.min(0.22, w / 10)}
            className="fill-muted-foreground font-medium tracking-wide uppercase"
          >
            {roomLabels[kind]}
          </PlanText>
        </g>
      )}
    </g>
  );
}

/** A unit's rooms inside its walls, drawn at the design's size. */
export function UnitArt({ design, size }: { design: UnitDesign; size?: [number, number] }) {
  // A unit resized on its floor stretches its type's drawing to fit.
  const scale =
    size && (size[0] !== design.width || size[1] !== design.depth)
      ? `scale(${size[0] / design.width} ${size[1] / design.depth})`
      : undefined;
  return (
    <g transform={scale}>
      <rect width={design.width} height={design.depth} className="fill-card" />
      {design.rooms.map((room) => (
        <g key={room.id} transform={itemTransform(room)}>
          <RoomArt kind={room.kind} w={room.w} h={room.h} flip={room.flip} />
        </g>
      ))}
      <rect
        width={design.width}
        height={design.depth}
        className="fill-none stroke-foreground/70"
        vectorEffect="non-scaling-stroke"
        strokeWidth={2.5}
      />
    </g>
  );
}

/** A shared space on a floor: hallway, elevator, stairs, lobby or utility. */
export function SpaceArt({
  kind,
  w,
  h,
  label = true,
}: {
  kind: SpaceKind;
  w: number;
  h: number;
  /** Off for small icons, where the name would be unreadable. */
  label?: boolean;
}) {
  // Parking pieces placed on a floor are drawn the way the parking plan draws them.
  if (kind === "driveway" || kind === "ramp" || kind === "pillar")
    return <ParkingArt kind={kind} w={w} h={h} />;
  const treads = Math.max(3, Math.floor(w / 0.3));
  return (
    <g>
      <rect
        width={w}
        height={h}
        className="fill-muted stroke-foreground/40"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1.25}
      />
      {kind === "elevator" && <path d={`M0 0 L${w} ${h} M${w} 0 L0 ${h}`} {...mark} />}
      {kind === "stairs" &&
        Array.from({ length: treads - 1 }, (_, i) => (
          <path key={i} d={`M${((i + 1) * w) / treads} 0 V${h}`} {...mark} />
        ))}
      {kind === "utility" && (
        <path d={`M0 ${h} L${Math.min(w, h)} ${h - Math.min(w, h)}`} {...mark} />
      )}
      {label && (
        <PlanText
          x={w / 2}
          y={h / 2}
          size={Math.min(0.38, w / 8)}
          dominantBaseline="central"
          className="fill-muted-foreground font-semibold tracking-wide uppercase"
        >
          {spaceLabels[kind]}
        </PlanText>
      )}
    </g>
  );
}

/** A small picture of a unit type's design, for lists and the floor designer's pieces. */
export function UnitThumbnail({ design, className }: { design: UnitDesign; className?: string }) {
  const { x0, y0, x1, y1 } = designBounds(design);
  return (
    <svg
      viewBox={`${x0 - 0.2} ${y0 - 0.2} ${x1 - x0 + 0.4} ${y1 - y0 + 0.4}`}
      className={className}
      aria-hidden="true"
    >
      <UnitArt design={design} />
    </svg>
  );
}

/** A placed unit's number and type on a small card, kept upright and inside the unit. */
export function PlacedLabel({
  code,
  detail,
  w,
  h,
}: {
  code: string;
  detail: string;
  w: number;
  h: number;
}) {
  // Text widths are estimated from character counts: bold digits ~0.62em, small text ~0.55em.
  const textWidth = (size: number) =>
    Math.max(code.length * size * 0.62, detail.length * size * 0.6 * 0.55);
  let size = Math.min(0.8, Math.max(0.35, Math.min(w, h) / 6));
  const room = w * 0.86 - size * 0.8;
  if (textWidth(size) > room) size = Math.max(0.3, (size * room) / textWidth(size));
  const cardW = textWidth(size) + size * 0.8;
  const cardH = size * (detail ? 2.1 : 1.3);
  return (
    <g className="pointer-events-none">
      <rect
        x={(w - cardW) / 2}
        y={(h - cardH) / 2}
        width={cardW}
        height={cardH}
        rx={size * 0.22}
        className="fill-card/95 stroke-border"
        vectorEffect="non-scaling-stroke"
        strokeWidth={1}
      />
      <PlanText
        x={w / 2}
        y={(h - cardH) / 2 + size * 1.0}
        size={size}
        className="fill-foreground font-bold tabular-nums"
      >
        {code}
      </PlanText>
      {detail && (
        <PlanText
          x={w / 2}
          y={(h - cardH) / 2 + size * 1.82}
          size={size * 0.6}
          className="fill-muted-foreground font-medium"
        >
          {detail}
        </PlanText>
      )}
    </g>
  );
}

/** Plans are drawn in metres, and Chrome squashes letters set below 1px; so text is set 100× larger and scaled down. */
function PlanText({
  x,
  y,
  size,
  ...props
}: { x: number; y: number; size: number } & React.SVGProps<SVGTextElement>) {
  return (
    <text
      transform="scale(0.01)"
      x={x * 100}
      y={y * 100}
      textAnchor="middle"
      style={{ fontSize: size * 100 }}
      {...props}
    />
  );
}

const paint = {
  vectorEffect: "non-scaling-stroke",
  strokeWidth: 1.5,
} as const;

/** A parking piece drawn at its own size (0…w, 0…h), as seen from above. */
export function ParkingArt({
  kind,
  w,
  h,
}: {
  kind: "slot" | "driveway" | "ramp" | "pillar";
  w: number;
  h: number;
}) {
  if (kind === "slot")
    return (
      <g>
        <rect width={w} height={h} className="fill-slate-200/70 dark:fill-slate-700/50" />
        {/* Side lines and the back line; the open end faces the drive path. */}
        <path d={`M0 ${h} V0 H${w} V${h}`} className="fill-none stroke-foreground/60" {...paint} />
        <rect x={w * 0.3} y={0.35} width={w * 0.4} height={0.15} className="fill-amber-400/80" />
      </g>
    );
  if (kind === "pillar")
    return <rect width={w} height={h} className="fill-slate-500 stroke-slate-700" {...paint} />;
  if (kind === "ramp") {
    const marks = Math.max(2, Math.floor(h / 1.2));
    return (
      <g>
        <rect width={w} height={h} className="fill-slate-300 stroke-foreground/40" {...paint} />
        {Array.from({ length: marks }, (_, i) => {
          const y = ((i + 0.5) * h) / marks;
          return (
            <path
              key={i}
              d={`M${w * 0.25} ${y + 0.3} L${w / 2} ${y - 0.2} L${w * 0.75} ${y + 0.3}`}
              className="fill-none stroke-foreground/50"
              {...paint}
            />
          );
        })}
      </g>
    );
  }
  // Drive path: asphalt with a dashed line and an arrow along its long side.
  const along = w >= h;
  const mid = along ? h / 2 : w / 2;
  return (
    <g>
      <rect width={w} height={h} className="fill-slate-400/70 dark:fill-slate-600/70" />
      <path
        d={along ? `M0.5 ${mid} H${w - 0.5}` : `M${mid} 0.5 V${h - 0.5}`}
        className="fill-none stroke-white"
        strokeDasharray="6 6"
        {...paint}
      />
      <path
        d={
          along
            ? `M${w / 2 - 0.5} ${mid - 0.6} L${w / 2 + 0.5} ${mid} L${w / 2 - 0.5} ${mid + 0.6}`
            : `M${mid - 0.6} ${h / 2 - 0.5} L${mid} ${h / 2 + 0.5} L${mid + 0.6} ${h / 2 - 0.5}`
        }
        className="fill-none stroke-white"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
