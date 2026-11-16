"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { previousVisit } from "./route-trail";

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

  return (
    <Button
      type="button"
      variant="secondary"
      className="gap-2"
      onClick={() => {
        if (previousVisit(pathname) !== null) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
