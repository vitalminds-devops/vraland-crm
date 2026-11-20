"use client";

import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function FilePrintActions({ id, mimeType }: { id: string; mimeType: string | null }) {
  if (mimeType !== "application/pdf" && mimeType !== "image/jpeg" && mimeType !== "image/png")
    return null;

  return mimeType === "application/pdf" ? (
    <a
      href={`/api/documents/${id}/download?inline=1`}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "secondary", className: "gap-2" })}
    >
      <Printer aria-hidden="true" className="size-4" />
      Print / Save as PDF
    </a>
  ) : (
    <Button type="button" variant="secondary" className="gap-2" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
