"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

const menuIconClass = "flex shrink-0 text-muted-foreground [&>svg]:size-4";

export type MenuSection = {
  label: string;
  items: MenuItem[];
};

export type MenuItem = {
  label: string;
  icon: React.ReactNode;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  badge?: number | string;
  asChild?: boolean;
};

export type RowActionsMenuProps = {
  ariaLabel: string;
  sections: MenuSection[];
  align?: "start" | "center" | "end" | undefined;
  className?: string;
};

export function RowActionsMenu({
  ariaLabel,
  sections,
  align = "end",
  className,
}: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-56"
        onClick={(event) => event.stopPropagation()}
      >
        {sections
          .filter((section) => section.items.length > 0)
          .map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {sectionIndex > 0 && <DropdownMenuSeparator />}
              {section.label && (
                <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </DropdownMenuLabel>
              )}
              <DropdownMenuGroup>
                {section.items.map((item, itemIndex) => (
                  <DropdownMenuItem
                    key={`${sectionIndex}-${itemIndex}`}
                    asChild={item.asChild && Boolean(item.href)}
                    disabled={item.disabled}
                    onSelect={item.onSelect}
                    className={cn(item.destructive && "text-destructive focus:text-destructive")}
                    title={item.disabled ? item.disabledReason : undefined}
                  >
                    {item.href ? (
                      <a href={item.href}>
                        {item.icon && (
                          <span className={menuIconClass} aria-hidden="true">
                            {item.icon}
                          </span>
                        )}
                        {item.label}
                        {item.badge !== undefined && (
                          <span className="ml-auto rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </a>
                    ) : (
                      <>
                        {item.icon && (
                          <span className={menuIconClass} aria-hidden="true">
                            {item.icon}
                          </span>
                        )}
                        {item.label}
                        {item.badge !== undefined && (
                          <span className="ml-auto rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
