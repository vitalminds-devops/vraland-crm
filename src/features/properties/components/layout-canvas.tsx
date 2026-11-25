"use client";

import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  GRID,
  MIN_PIECE,
  footprint,
  overlapping,
  placeWithin,
  rotate,
  snap,
  type LayoutItem,
} from "../lib/floor-layout";
import { itemTransform } from "./layout-art";

/** Palette pieces carry this key while dragged onto the canvas. */
export const PIECE_MIME = "application/x-layout-piece";

type Piece = LayoutItem & { flip?: boolean };
type Gesture = { id: string; mode: "move" | "resize"; dx: number; dy: number };
/** Dragging the empty canvas pans it; a press that doesn't move just clears the selection. */
type Pan = { x: number; y: number; left: number; top: number; moved: boolean };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * A metre grid to arrange pieces on: drop from a palette, drag to move, drag the corner to resize,
 * R to rotate, F to flip, Delete to remove, arrows to nudge, Ctrl+D to duplicate. Like an editing
 * app: Ctrl/⌘ + scroll zooms at the cursor, dragging the empty canvas pans, double-click zooms to a
 * piece. Overlapping pieces turn red.
 */
export function LayoutCanvas<T extends Piece>({
  width,
  depth,
  items,
  onChange,
  render,
  label,
  resizable,
  selectedId,
  onSelect,
  onDropPiece,
  ariaLabel,
  toolbar,
  walls = false,
  margin,
  overhang = 0,
  ignoreClash,
  history,
}: {
  width: number;
  depth: number;
  items: T[];
  onChange: (items: T[]) => void;
  /** The piece's drawing at its own size (0…w, 0…h). */
  render: (item: T) => ReactNode;
  /** Text kept upright over the piece, in metres from its footprint's top-left. */
  label?: (item: T, size: [number, number]) => ReactNode;
  resizable: (item: T) => boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDropPiece: (key: string, x: number, y: number) => void;
  ariaLabel: string;
  /** Shown left of the zoom buttons, such as the selected piece's actions. */
  toolbar?: ReactNode;
  /** Draw the canvas edge as solid outer walls (a unit) instead of a dashed boundary (a floor). */
  walls?: boolean;
  /** How far a piece may reach past the edges; a unit's balconies sit outside its walls. */
  margin?: (item: T) => number;
  /** The outside band to show around the canvas for those pieces, in metres. */
  overhang?: number;
  /** Pieces that may sit over others without being flagged, such as a door on a wall. */
  ignoreClash?: (item: T) => boolean;
  /** Undo and redo for the pieces, shown beside the zoom. */
  history?: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pan = useRef<Pan | null>(null);
  const lastPress = useRef<{ id: string; at: number } | null>(null);
  // The metre point to keep under the cursor once a zoom has been drawn.
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const toMetres = (clientX: number, clientY: number) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const zoomAt = (next: number, clientX: number, clientY: number) => {
    anchor.current = { ...toMetres(clientX, clientY), clientX, clientY };
    setZoom(clampZoom(next));
  };
  // The wheel listener is attached once, so it reads the latest zoom through these.
  const zoomAtRef = useRef(zoomAt);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomAtRef.current = zoomAt;
    zoomRef.current = zoom;
  });
  // At 100% the whole canvas fits the space it has; zoom goes in from there.
  const measure = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    scroller.current = node;
    if (!node) return;
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setFrame({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.current.observe(node);
    // Not passive, so Ctrl/⌘ + scroll can zoom the canvas instead of the page.
    node.addEventListener(
      "wheel",
      (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        zoomAtRef.current(
          zoomRef.current * Math.exp(-event.deltaY * 0.0015),
          event.clientX,
          event.clientY,
        );
      },
      { passive: false },
    );
  }, []);
  // After a zoom is drawn, scroll so the point that was under the cursor still is.
  useLayoutEffect(() => {
    const target = anchor.current;
    const matrix = svgRef.current?.getScreenCTM();
    if (!target || !matrix || !scroller.current) return;
    anchor.current = null;
    const now = new DOMPoint(target.x, target.y).matrixTransform(matrix);
    scroller.current.scrollLeft += now.x - target.clientX;
    scroller.current.scrollTop += now.y - target.clientY;
  }, [zoom]);
  const gridId = useId();
  const pad = 0.4 + overhang;
  const marginOf = (item: T) => margin?.(item) ?? 0;
  const fit = frame
    ? Math.max(4, Math.min((frame.w - 24) / (width + pad * 2), (frame.h - 24) / (depth + pad * 2)))
    : 28;
  const ppm = fit * zoom;
  const clashes = overlapping(ignoreClash ? items.filter((item) => !ignoreClash(item)) : items);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  /** Zooms so a piece fills about half the view, centred. */
  const zoomTo = (item: T) => {
    const box = scroller.current?.getBoundingClientRect();
    const matrix = svgRef.current?.getScreenCTM();
    if (!box || !matrix) return;
    const [fw, fh] = footprint(item);
    const next = clampZoom(
      Math.min((box.width * 0.5) / (fw * ppm), (box.height * 0.5) / (fh * ppm)) * zoom,
    );
    const centre = new DOMPoint(item.x + fw / 2, item.y + fh / 2).matrixTransform(matrix);
    // Zoom about the piece's centre, then bring that centre to the middle of the view.
    anchor.current = {
      x: item.x + fw / 2,
      y: item.y + fh / 2,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
    };
    if (next === zoom) {
      scroller.current!.scrollLeft += centre.x - (box.left + box.width / 2);
      scroller.current!.scrollTop += centre.y - (box.top + box.height / 2);
      anchor.current = null;
    } else setZoom(next);
  };
  const update = (next: T) => onChange(items.map((item) => (item.id === next.id ? next : item)));

  const start = (event: React.PointerEvent, item: T, mode: Gesture["mode"]) => {
    event.stopPropagation();
    // The middle button pans from anywhere, as in drawing apps.
    if (event.button === 1) return startPan(event);
    // Two quick presses on the same piece zoom to it. Checked here, as dragging captures the
    // pointer and the piece itself never gets a dblclick.
    const now = event.timeStamp;
    const double = lastPress.current?.id === item.id && now - lastPress.current.at < 350;
    lastPress.current = { id: item.id, at: now };
    if (double && mode === "move") {
      lastPress.current = null;
      onSelect(item.id);
      zoomTo(item);
      return;
    }
    onSelect(item.id);
    svgRef.current?.setPointerCapture(event.pointerId);
    const at = toMetres(event.clientX, event.clientY);
    gesture.current = { id: item.id, mode, dx: at.x - item.x, dy: at.y - item.y };
  };
  const move = (event: React.PointerEvent) => {
    const panning = pan.current;
    if (panning && scroller.current) {
      const dx = event.clientX - panning.x;
      const dy = event.clientY - panning.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) panning.moved = true;
      scroller.current.scrollLeft = panning.left - dx;
      scroller.current.scrollTop = panning.top - dy;
      return;
    }
    const active = gesture.current;
    const item = active && items.find((piece) => piece.id === active.id);
    if (!active || !item) return;
    const at = toMetres(event.clientX, event.clientY);
    if (active.mode === "move") {
      const next = placeWithin(
        { ...item, x: at.x - active.dx, y: at.y - active.dy },
        width,
        depth,
        marginOf(item),
      );
      if (next.x !== item.x || next.y !== item.y) update(next);
      return;
    }
    const fw = Math.min(width + marginOf(item) - item.x, Math.max(MIN_PIECE, snap(at.x - item.x)));
    const fh = Math.min(depth + marginOf(item) - item.y, Math.max(MIN_PIECE, snap(at.y - item.y)));
    const [w, h] = item.rotation % 180 ? [fh, fw] : [fw, fh];
    if (w !== item.w || h !== item.h) update({ ...item, w, h });
  };
  const end = () => {
    gesture.current = null;
    if (pan.current && !pan.current.moved) onSelect(null);
    pan.current = null;
  };
  const startPan = (event: React.PointerEvent) => {
    if (!scroller.current) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    pan.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.current.scrollLeft,
      top: scroller.current.scrollTop,
      moved: false,
    };
  };

  const keys = (event: React.KeyboardEvent) => {
    if (!selected) return;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-GRID, 0],
      ArrowRight: [GRID, 0],
      ArrowUp: [0, -GRID],
      ArrowDown: [0, GRID],
    };
    if (nudge[event.key]) {
      const [dx, dy] = nudge[event.key]!;
      update(
        placeWithin(
          { ...selected, x: selected.x + dx, y: selected.y + dy },
          width,
          depth,
          marginOf(selected),
        ),
      );
    } else if (event.key === "Delete" || event.key === "Backspace") {
      onChange(items.filter((item) => item.id !== selected.id));
      onSelect(null);
    } else if (event.key === "r" || event.key === "R") {
      update(placeWithin(rotate(selected), width, depth, marginOf(selected)));
    } else if ((event.key === "f" || event.key === "F") && selected.flip !== undefined) {
      update({ ...selected, flip: !selected.flip });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      // A copy a step down and right; a copied unit or slot becomes a new one when saved.
      const copy = {
        ...selected,
        id: crypto.randomUUID().slice(0, 8),
        ...("unitId" in selected ? { unitId: null } : {}),
        ...("slotId" in selected ? { slotId: null } : {}),
      } as T;
      const placed = placeWithin(
        { ...copy, x: selected.x + 1, y: selected.y + 1 },
        width,
        depth,
        marginOf(selected),
      );
      onChange([...items, placed]);
      onSelect(placed.id);
    } else if (event.key === "Escape") {
      onSelect(null);
    } else return;
    event.preventDefault();
  };

  return (
    <div className="flex min-h-[18rem] flex-1 flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">{toolbar}</div>
        <div className="flex items-center gap-1">
          {history && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
                disabled={!history.canUndo}
                onClick={history.undo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
                disabled={!history.canRedo}
                onClick={history.redo}
              >
                <Redo2 className="size-4" />
              </Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom out"
            title="Zoom out (Ctrl + scroll)"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((value) => clampZoom(value / 1.25))}
          >
            <Minus className="size-4" />
          </Button>
          <button
            type="button"
            className="h-8 w-12 rounded-md text-center text-xs tabular-nums text-muted-foreground hover:bg-muted"
            aria-label="Fit to screen"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Zoom in"
            title="Zoom in (Ctrl + scroll)"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((value) => clampZoom(value * 1.25))}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Fit to screen"
            title="Fit to screen"
            onClick={() => setZoom(1)}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={measure}
          className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-muted/30"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PIECE_MIME)) event.preventDefault();
          }}
          onDrop={(event) => {
            const key = event.dataTransfer.getData(PIECE_MIME);
            if (!key) return;
            event.preventDefault();
            const at = toMetres(event.clientX, event.clientY);
            onDropPiece(key, at.x, at.y);
          }}
        >
          <div className="grid min-h-full w-max min-w-full place-items-center p-3">
            <svg
              ref={svgRef}
              role="application"
              aria-label={ariaLabel}
              tabIndex={0}
              viewBox={`${-pad} ${-pad} ${width + pad * 2} ${depth + pad * 2}`}
              width={(width + pad * 2) * ppm}
              height={(depth + pad * 2) * ppm}
              className="block cursor-grab touch-none select-none focus-visible:outline-none active:cursor-grabbing"
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onPointerDown={startPan}
              onKeyDown={keys}
            >
              <defs>
                <pattern id={gridId} width={1} height={1} patternUnits="userSpaceOnUse">
                  <path
                    d="M1 0 H0 V1"
                    className="fill-none stroke-foreground/10"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth={1}
                  />
                </pattern>
              </defs>
              {overhang > 0 && (
                <rect
                  x={-overhang}
                  y={-overhang}
                  width={width + overhang * 2}
                  height={depth + overhang * 2}
                  rx={0.2}
                  className="fill-muted/50 stroke-border"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <rect width={width} height={depth} className="fill-background" />
              <rect width={width} height={depth} fill={`url(#${gridId})`} />
              <rect
                width={width}
                height={depth}
                className="fill-none stroke-foreground/50"
                vectorEffect="non-scaling-stroke"
                strokeWidth={walls ? 5 : 1.5}
                strokeDasharray={walls ? undefined : "6 4"}
              />
              {items.map((item) => {
                const [fw, fh] = footprint(item);
                const isSelected = item.id === selectedId;
                return (
                  <g
                    key={item.id}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(event) => start(event, item, "move")}
                  >
                    <g transform={itemTransform(item)}>{render(item)}</g>
                    {label && (
                      <g transform={`translate(${item.x} ${item.y})`}>{label(item, [fw, fh])}</g>
                    )}
                    {(isSelected || clashes.has(item.id)) && (
                      <rect
                        x={item.x}
                        y={item.y}
                        width={fw}
                        height={fh}
                        className={cn(
                          "pointer-events-none fill-none",
                          clashes.has(item.id) ? "stroke-destructive" : "stroke-primary",
                        )}
                        vectorEffect="non-scaling-stroke"
                        strokeWidth={2.5}
                        strokeDasharray={isSelected ? "6 3" : undefined}
                      />
                    )}
                    {isSelected && resizable(item) && (
                      <rect
                        x={item.x + fw - 12 / ppm}
                        y={item.y + fh - 12 / ppm}
                        width={14 / ppm}
                        height={14 / ppm}
                        rx={3 / ppm}
                        aria-label="Resize"
                        className="cursor-nwse-resize fill-primary stroke-background"
                        vectorEffect="non-scaling-stroke"
                        strokeWidth={1.5}
                        onPointerDown={(event) => start(event, item, "resize")}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
