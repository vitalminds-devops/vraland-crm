"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintBillButton() {
  return (
    <Button type="button" variant="secondary" className="gap-2" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      Print bill
    </Button>
  );
}
