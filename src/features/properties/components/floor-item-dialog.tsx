"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

const DesignedFloorScene = dynamic(() => import("./designed-floor-scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Loading 3D view…
    </div>
  ),
});

/** Opens inside the full-screen view when it is on, or it would be hidden behind it. */
const overlayRoot = () =>
  typeof document === "undefined" ? undefined : (document.fullscreenElement as HTMLElement | null);

type SceneProps = Omit<
  ComponentProps<typeof DesignedFloorScene>,
  "children" | "onFallback" | "selectedUnitId"
>;

/**
 * A unit or parking slot picked on the floor view, opened large: the thing itself in 3D on the
 * left, its details and actions on the right (stacked on phones).
 */
export function FloorItemDialog({
  title,
  subtitle,
  scene,
  flat,
  onClose,
  children,
  footer,
  sceneActions,
}: {
  title: string;
  subtitle: ReactNode;
  /** What the 3D view draws; null shows `flat` alone. */
  scene: SceneProps | null;
  /** Shown without 3D (no WebGL), or when there is nothing to draw. */
  flat: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Buttons for the 3D view's toolbar, beside Hide labels; over the flat view without 3D. */
  sceneActions?: ReactNode;
}) {
  const [noWebGl, setNoWebGl] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPortal container={overlayRoot()}>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
          <DialogPopup className="relative grid h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-rows-[minmax(12rem,34dvh)_minmax(0,1fr)] overflow-hidden rounded-xl bg-card shadow-xl md:h-[min(40rem,calc(100dvh-2rem))] md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-[minmax(0,1fr)]">
            <DialogClose
              aria-label="Close"
              className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-md bg-card text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:size-9"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogClose>

            <div className="grid min-h-0 place-items-center overflow-hidden border-b border-border/60 bg-muted/30 md:border-r md:border-b-0">
              {scene && !noWebGl ? (
                <div className="size-full">
                  <DesignedFloorScene
                    {...scene}
                    selectedUnitId={null}
                    onFallback={() => setNoWebGl(true)}
                    extraActions={sceneActions}
                  >
                    {null}
                  </DesignedFloorScene>
                </div>
              ) : (
                <div className="relative grid size-full place-items-center">
                  {sceneActions && <div className="absolute top-3 left-3">{sceneActions}</div>}
                  {flat}
                </div>
              )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="shrink-0 space-y-1 border-b border-border/40 p-5 pr-14">
                <DialogTitle className="text-lg leading-6 break-words font-semibold">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-[13px] leading-5 break-words text-muted-foreground">
                  {subtitle}
                </DialogDescription>
              </div>
              <div
                role="region"
                aria-label={`${title} details`}
                tabIndex={0}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
              >
                {children}
              </div>
              {footer}
            </div>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

/** Label and value rows, divided like the rest of the app's figures. */
export function DetailList({ rows }: { rows: [string, string | null][] }) {
  const shown = rows.filter((row): row is [string, string] => Boolean(row[1]));
  if (!shown.length) return null;
  return (
    <dl className="shrink-0 divide-y divide-border/40 border-b border-border/40 px-5 text-[13px]">
      {shown.map(([label, value]) => (
        <div
          key={label}
          className="flex min-h-10 items-baseline justify-between gap-4 py-2.5 leading-5"
        >
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-right break-words font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
