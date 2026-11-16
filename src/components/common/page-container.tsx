import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1600px] min-w-0 p-4 sm:p-5 lg:p-6", className)}>
      {children}
    </div>
  );
}
