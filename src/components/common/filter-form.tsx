"use client";

import Form from "next/form";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * GET filter bar that applies as soon as a dropdown changes; text search
 * applies on Enter. Replaces the per-page "Filter" / "Apply filters" buttons.
 */
export function FilterForm(props: Omit<ComponentProps<"form">, "action">) {
  const pathname = usePathname();
  return (
    <Form
      {...props}
      action={pathname}
      replace
      scroll={false}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    />
  );
}
