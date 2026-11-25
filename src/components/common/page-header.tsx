"use client";

import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HeaderSlotContext } from "./header-slot";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const slot = useContext(HeaderSlotContext);

  const titleBlock = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg sm:text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 hidden truncate text-[12.5px] leading-snug text-muted-foreground sm:block">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );

  const actionsRow = actions ? (
    // Phones collapse the row when everything in it moved to the top bar or floats (data-phone-hidden).
    <div className="flex flex-wrap items-center justify-start gap-2 pb-6 sm:justify-end max-sm:[&:not(:has(>:not([data-phone-hidden])))]:pb-0">
      {actions}
    </div>
  ) : null;

  // Used outside the shell: render inline
  if (slot === undefined) {
    return (
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6">
        {titleBlock}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
    );
  }

  return (
    <>
      {slot ? createPortal(titleBlock, slot) : null}
      {actionsRow}
    </>
  );
}
