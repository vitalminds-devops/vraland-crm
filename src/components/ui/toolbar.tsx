import { type ReactNode } from "react";

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function Toolbar({ children, className = "" }: ToolbarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 lg:gap-3 ${className}`}>{children}</div>
  );
}
