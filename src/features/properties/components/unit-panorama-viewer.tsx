"use client";

import { Building2, ImageOff, Move, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

interface UnitPanoramaViewerProps {
  imageUrl: string | null;
  unitCode: string;
  onClose: () => void;
}

export function UnitPanoramaViewer({ imageUrl, unitCode, onClose }: UnitPanoramaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const unavailable = !imageUrl || failed;

  useEffect(() => {
    const element = viewport;
    if (!element || unavailable) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((value) => Math.max(1, Math.min(3, value + (event.deltaY < 0 ? 0.25 : -0.25))));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [viewport, unavailable]);

  const reset = () => {
    setZoom(1);
    viewport?.scrollTo(0, 0);
  };
  const controlClass =
    "size-9 rounded-lg text-zinc-200 hover:bg-white/10 hover:text-white focus-visible:ring-white/40";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] bg-zinc-950/90 backdrop-blur-md" />
        <DialogPopup
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener?.focus();
          }}
          className="fixed inset-2 z-[60] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl outline-none sm:inset-6 lg:inset-x-[5vw]"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-zinc-900 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-400/15 text-violet-300">
                <Building2 aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-semibold">
                  Unit {unitCode}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-zinc-400">
                  Photo preview
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close photo viewer"
              className={controlClass}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </header>

          <div
            ref={setViewport}
            role="region"
            tabIndex={0}
            aria-label={`Photo of unit ${unitCode}`}
            className="relative min-h-0 flex-1 touch-none overflow-auto bg-zinc-950"
            style={{
              cursor: unavailable || zoom === 1 ? "default" : dragging ? "grabbing" : "grab",
            }}
            onPointerDown={(event) => {
              if (unavailable || zoom === 1 || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
              setDragging(true);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
              event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
          >
            {unavailable ? (
              <div className="grid h-full min-h-40 place-content-center gap-3 p-6 text-center text-zinc-400">
                <ImageOff aria-hidden="true" className="mx-auto size-8" />
                <p className="text-sm">
                  {failed ? "Couldn't load this photo." : "No photo available for this unit."}
                </p>
              </div>
            ) : (
              <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- The image optimizer cannot fetch authenticated unit photos. */}
                <img
                  src={imageUrl}
                  alt={`Unit ${unitCode}`}
                  draggable={false}
                  onError={() => setFailed(true)}
                  className="h-full w-full select-none object-contain"
                />
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-3 border-t border-white/10 bg-zinc-900 px-4 py-3 sm:justify-between sm:px-6">
            <p className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
              <Move aria-hidden="true" className="size-3.5" />
              Zoom in to pan · Ctrl + scroll to zoom
            </p>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-zinc-950/50 p-1">
              <Button
                type="button"
                onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
                disabled={unavailable || zoom <= 1}
                variant="ghost"
                size="icon"
                className={controlClass}
                aria-label="Zoom out"
              >
                <ZoomOut aria-hidden="true" className="size-4" />
              </Button>
              <output
                aria-label="Zoom level"
                className="w-14 text-center text-xs font-medium tabular-nums"
              >
                {Math.round(zoom * 100)}%
              </output>
              <Button
                type="button"
                onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
                disabled={unavailable || zoom >= 3}
                variant="ghost"
                size="icon"
                className={controlClass}
                aria-label="Zoom in"
              >
                <ZoomIn aria-hidden="true" className="size-4" />
              </Button>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/10" />
              <Button
                type="button"
                onClick={reset}
                disabled={unavailable}
                variant="ghost"
                size="icon"
                className={controlClass}
                aria-label="Fit photo"
                title="Fit photo"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </footer>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
