"use client";

import { Maximize2, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  GRID,
  type LayoutItem,
  MIN_PIECE,
  copyGroupBeside,
  footprint,
  moveGroup,
  overlapping,
  placeWithin,
  rotate,
  snap,
} from "../lib/floor-layout";
import { itemTransform } from "./layout-art";

/** Palette pieces carry this key while dragged onto the canvas. */
export const PIECE_MIME = "application/x-layout-piece";

type Piece = LayoutItem & { flip?: boolean };
/** Moving drags every picked piece from where it was; resizing pulls one piece's corner. */
type Gesture<T> =
  | { mode: "move"; id: string; from: { x: number; y: number }; origins: T[]; moved: boolean }
  | { mode: "resize"; id: string };
/** Dragging the empty canvas pans it; a press that doesn't move just clears the selection. */
type Pan = { x: number; y: number; left: number; top: number; moved: boolean };
/** Shift + drag on the empty canvas draws a box that picks every piece it touches. */
type Box = { x0: number; y0: number; x1: number; y1: number };

const newPieceId = () => crypto.randomUUID().slice(0, 8);

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * A metre grid to arrange pieces on: drop from a palette, drag to move, drag the corner to resize,
 * R to rotate, F to flip, Delete to remove, arrows to nudge, Ctrl+D to duplicate. Like an editing
 * app: Shift/Ctrl + click or Shift + drag picks several (Ctrl+A all) to move, copy (Ctrl+C, Ctrl+V)
 * or remove together; Ctrl/⌘ + scroll zooms at the cursor, dragging the empty canvas pans,
 * double-click zooms to a piece. Overlapping pieces turn red.
 */
export function LayoutCanvas<T extends Piece>({
  width,
  depth,
  items,
  onChange,
  render,
  label,
  resizable,
  selectedIds,
  onSelect,
  onDropPiece,
  ariaLabel,
  toolbar,
  walls = false,
  margin,
  overhang = 0,
  ignoreClash,
  flippable = (item) => item.flip !== undefined,
  onOpen,
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
  selectedIds: readonly string[];
  onSelect: (ids: string[]) => void;
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
  /** Pieces F (and Flip) mirrors; by default those that carry a `flip`. */
  flippable?: (item: T) => boolean;
  /** Double-click opens a piece, such as a unit's rooms; without it, double-click zooms to it. */
  onOpen?: (item: T) => boolean;
  /** Undo and redo for the pieces, shown beside the zoom. */
  history?: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture<T> | null>(null);
  const pan = useRef<Pan | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Pieces copied with Ctrl+C; each paste lands beside the last one.
  const clipboard = useRef<T[]>([]);
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
  const picked = items.filter((item) => selectedIds.includes(item.id));
  // Rotate, flip and resize work on one piece at a time.
  const selected = picked.length === 1 ? picked[0]! : null;

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
  const replace = (next: readonly T[]) => {
    const byId = new Map(next.map((item) => [item.id, item]));
    onChange(items.map((item) => byId.get(item.id) ?? item));
  };
  const addCopies = (from: readonly T[]) => {
    const copies = copyGroupBeside(from, width, depth, newPieceId, marginOf);
    onChange([...items, ...copies]);
    onSelect(copies.map((copy) => copy.id));
    return copies;
  };

  const start = (event: React.PointerEvent, item: T, mode: Gesture<T>["mode"]) => {
    event.stopPropagation();
    // The middle button pans from anywhere, as in drawing apps.
    if (event.button === 1) return startPan(event);
    // Shift or Ctrl + click adds a piece to the picked ones, or takes it out.
    if (mode === "move" && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      onSelect(
        selectedIds.includes(item.id)
          ? selectedIds.filter((id) => id !== item.id)
          : [...selectedIds, item.id],
      );
      return;
    }
    // Two quick presses on the same piece zoom to it. Checked here, as dragging captures the
    // pointer and the piece itself never gets a dblclick.
    const now = event.timeStamp;
    const double = lastPress.current?.id === item.id && now - lastPress.current.at < 350;
    lastPress.current = { id: item.id, at: now };
    if (double && mode === "move") {
      lastPress.current = null;
      onSelect([item.id]);
      if (!onOpen?.(item)) zoomTo(item);
      return;
    }
    // Dragging one of several picked pieces moves them all.
    const together = mode === "move" && selectedIds.includes(item.id);
    if (!together) onSelect([item.id]);
    svgRef.current?.setPointerCapture(event.pointerId);
    gesture.current =
      mode === "move"
        ? {
            mode,
            id: item.id,
            from: toMetres(event.clientX, event.clientY),
            origins: together ? items.filter((piece) => selectedIds.includes(piece.id)) : [item],
            moved: false,
          }
        : { mode, id: item.id };
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
    if (box) {
      const at = toMetres(event.clientX, event.clientY);
      setBox({ ...box, x1: at.x, y1: at.y });
      return;
    }
    const active = gesture.current;
    const item = active && items.find((piece) => piece.id === active.id);
    if (!active || !item) return;
    const at = toMetres(event.clientX, event.clientY);
    if (active.mode === "move") {
      const next = moveGroup(
        active.origins,
        at.x - active.from.x,
        at.y - active.from.y,
        width,
        depth,
        marginOf,
      );
      const lead = next.find((piece) => piece.id === item.id);
      if (lead && (lead.x !== item.x || lead.y !== item.y)) {
        active.moved = true;
        replace(next);
      }
      return;
    }
    const fw = Math.min(width + marginOf(item) - item.x, Math.max(MIN_PIECE, snap(at.x - item.x)));
    const fh = Math.min(depth + marginOf(item) - item.y, Math.max(MIN_PIECE, snap(at.y - item.y)));
    const [w, h] = item.rotation % 180 ? [fh, fw] : [fw, fh];
    if (w !== item.w || h !== item.h) update({ ...item, w, h });
  };
  const end = () => {
    const active = gesture.current;
    // A click on one of several picked pieces, without dragging, picks just that one.
    if (active?.mode === "move" && !active.moved && active.origins.length > 1)
      onSelect([active.id]);
    gesture.current = null;
    if (box) {
      const [x0, x1] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
      const [y0, y1] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
      const touched = items.filter((item) => {
        const [fw, fh] = footprint(item);
        return item.x < x1 && item.x + fw > x0 && item.y < y1 && item.y + fh > y0;
      });
      onSelect([...new Set([...selectedIds, ...touched.map((item) => item.id)])]);
      setBox(null);
      return;
    }
    if (pan.current && !pan.current.moved) onSelect([]);
    pan.current = null;
  };
  const startPan = (event: React.PointerEvent) => {
    if (!scroller.current) return;
    svgRef.current?.setPointerCapture(event.pointerId);
    if (event.shiftKey && event.button === 0) {
      const at = toMetres(event.clientX, event.clientY);
      setBox({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
      return;
    }
    pan.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.current.scrollLeft,
      top: scroller.current.scrollTop,
      moved: false,
    };
  };

  const keys = (event: React.KeyboardEvent) => {
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const shift: Record<string, [number, number]> = {
      ArrowLeft: [-GRID, 0],
      ArrowRight: [GRID, 0],
      ArrowUp: [0, -GRID],
      ArrowDown: [0, GRID],
    };
    if (command && key === "a") {
      onSelect(items.map((item) => item.id));
    } else if (command && key === "v" && clipboard.current.length) {
      // Each paste lands beside the last, so pasting again keeps stepping along.
      clipboard.current = addCopies(clipboard.current);
    } else if (!picked.length) {
      return;
    } else if (command && key === "c") {
      clipboard.current = picked;
    } else if (command && key === "d") {
      // Right beside them, the same size; a copied unit or slot becomes a new one when saved.
      addCopies(picked);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      onChange(items.filter((item) => !selectedIds.includes(item.id)));
      onSelect([]);
    } else if (event.key === "Escape") {
      onSelect([]);
    } else if (shift[event.key]) {
      const [dx, dy] = shift[event.key]!;
      replace(moveGroup(picked, dx, dy, width, depth, marginOf));
    } else if (selected && !command && key === "r") {
      // Rotate and flip work on one picked piece.
      update(placeWithin(rotate(selected), width, depth, marginOf(selected)));
    } else if (selected && !command && key === "f" && flippable(selected)) {
      update({ ...selected, flip: !selected.flip });
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
                    {clashes.has(item.id) && (
                      <rect
                        x={item.x}
                        y={item.y}
                        width={fw}
                        height={fh}
                        className="pointer-events-none fill-none stroke-destructive"
                        vectorEffect="non-scaling-stroke"
                        strokeWidth={2.5}
                      />
                    )}
                  </g>
                );
              })}
              {/* Picked pieces drawn over their neighbours: a tint, a soft halo and a solid edge. */}
              {picked.map((item) => {
                const [fw, fh] = footprint(item);
                return (
                  <g key={item.id}>
                    <rect
                      x={item.x}
                      y={item.y}
                      width={fw}
                      height={fh}
                      className="pointer-events-none fill-primary/10 stroke-primary/30"
                      vectorEffect="non-scaling-stroke"
                      strokeWidth={9}
                    />
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
                      strokeWidth={3}
                    />
                    {selected && resizable(item) && (
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
              {box && (
                <rect
                  x={Math.min(box.x0, box.x1)}
                  y={Math.min(box.y0, box.y1)}
                  width={Math.abs(box.x1 - box.x0)}
                  height={Math.abs(box.y1 - box.y0)}
                  className="pointer-events-none fill-primary/10 stroke-primary"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
