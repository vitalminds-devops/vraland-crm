"use client";

import { useContext } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { HeaderSlotContext } from "./header-slot";
import { previousVisit } from "./route-trail";

/**
 * A labelled button on wider screens. Phones get the usual app-bar arrow before the page
 * title instead, so the page itself starts with content.
 */
export function BackButton({
  fallbackHref,
  label,
}: {
  /** Where to go when the trail is empty: the route that owns this screen. */
  fallbackHref: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const slot = useContext(HeaderSlotContext);
  const goBack = () => {
    if (previousVisit(pathname) !== null) router.back();
    else router.push(fallbackHref);
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={slot ? "gap-2 max-sm:hidden" : "gap-2"}
        data-phone-hidden={slot ? "" : undefined}
        onClick={goBack}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {label}
      </Button>
      {slot &&
        createPortal(
          <button
            type="button"
            onClick={goBack}
            aria-label={label}
            className="order-first -ml-2 mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-foreground hover:bg-muted sm:hidden"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>,
          slot,
        )}
    </>
  );
}
