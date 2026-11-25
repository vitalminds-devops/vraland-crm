"use client";

import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Receipt,
  CreditCard,
  FileText,
  Gauge,
  KanbanSquare,
  Layers,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type { NavigationItem } from "./navigation";
import { HeaderSlotContext } from "../common/header-slot";
import { noteVisit } from "../common/route-trail";

const icons: Record<NavigationItem["icon"], ComponentType<{ className?: string }>> = {
  dashboard: Gauge,
  contacts: ContactRound,
  pipeline: KanbanSquare,
  properties: Building2,
  developments: Layers,
  tasks: UsersRound,
  calendar: CalendarDays,
  marketing: Bell,
  documents: FileText,
  reports: BarChart3,
  billing: Receipt,
  payments: CreditCard,
  team: Users,
  settings: Settings,
};
/** The phone tab bar: the main sections the user can open, with a short label each. */
const tabLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/contacts": "Contacts",
  "/pipeline": "Pipeline",
  "/tasks": "Tasks",
};

const SIDEBAR_STORAGE_KEY = "vra-sidebar-collapsed";
const SIDEBAR_CHANGE_EVENT = "vra-sidebar-change";
const sidebarServerSnapshot = () => false;
const sidebarSnapshot = () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
function subscribeToSidebar(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, listener);
  };
}

type ShellProps = {
  children: ReactNode;
  navigation: readonly NavigationItem[];
  user: { name: string; initials: string; avatar: string | null; role: string };
  organization: string;
};

export function CrmShell({ children, navigation, user }: ShellProps) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToSidebar,
    sidebarSnapshot,
    sidebarServerSnapshot,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    noteVisit(pathname);
  }, [pathname]);

  function toggleSidebar() {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }
  function toggleTheme() {
    setDark((value) => {
      document.documentElement.classList.toggle("dark", !value);
      localStorage.setItem("vra-theme", !value ? "dark" : "light");
      return !value;
    });
  }

  // The phone More sheet: every section not in the tab bar, grouped like the sidebar.
  const moreGroups: [string, NavigationItem[]][] = [];
  for (const item of navigation) {
    if (item.href in tabLabels) continue;
    const section = item.section ?? "";
    const last = moreGroups.at(-1);
    if (last && last[0] === section) last[1].push(item);
    else moreGroups.push([section, [item]]);
  }

  const sidebar = (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4",
          collapsed && !mobileOpen && "justify-center px-0",
        )}
      >
        <Image
          src="/images/vra_logo.png"
          alt="VRA Land Inc. logo"
          width={36}
          height={36}
          priority
          className="size-9 shrink-0 object-contain dark:rounded-md dark:bg-white dark:p-0.5"
        />
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              CRM - Real Estate
            </p>
            <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.1em] text-sidebar-muted">
              VRA Land Inc.
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground lg:hidden"
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </Button>
      </div>
      <nav
        className={cn(
          "sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 [@media(max-height:860px)]:py-2",
          collapsed && !mobileOpen && "px-0",
        )}
        aria-label="Primary navigation"
      >
        {(() => {
          return navigation.map((item, index) => {
            const Icon = icons[item.icon];
            const active = [item.href, ...(item.match ?? [])].some(
              (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
            );
            const section = item.section ?? "";
            const showHeader = section !== (navigation[index - 1]?.section ?? "");
            return (
              <div key={item.href}>
                {showHeader && (!collapsed || mobileOpen) && (
                  <p
                    className={cn(
                      "px-3 text-xs font-medium text-sidebar-muted",
                      navigation.indexOf(item) === 0
                        ? "mb-2 mt-2 [@media(max-height:860px)]:mb-1"
                        : "mb-2 mt-5 [@media(max-height:860px)]:mb-1 [@media(max-height:860px)]:mt-3",
                    )}
                  >
                    {section}
                  </p>
                )}
                {showHeader && collapsed && !mobileOpen && navigation.indexOf(item) > 0 && (
                  <div aria-hidden className="mx-auto my-1.5 h-px w-5 bg-sidebar-border/60" />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative mb-0.5 flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        active
                          ? "bg-sidebar-active font-medium text-sidebar-active-foreground"
                          : "font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                        collapsed &&
                          !mobileOpen &&
                          "mx-auto mb-0 h-10 w-10 justify-center rounded-lg px-0 [@media(max-height:860px)]:h-9",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          collapsed && !mobileOpen && "size-[18px]",
                          active && "text-sidebar-active-foreground",
                        )}
                      />
                      {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {collapsed && !mobileOpen && (
                    <TooltipContent side="right" sideOffset={12}>
                      {item.label}
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            );
          });
        })()}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Link
          href="/account"
          onClick={() => setMobileOpen(false)}
          title={`Account settings · ${user.name}`}
          aria-label={`Account settings for ${user.name}`}
          className={cn(
            "group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-sidebar-hover focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none",
            collapsed && !mobileOpen
              ? "mx-auto size-10 justify-center bg-transparent p-1"
              : "bg-sidebar-hover/60",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
              <img src={user.avatar} alt="" className="size-full object-cover" />
            ) : (
              user.initials
            )}
          </span>
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-sidebar-muted">{user.role}</p>
            </div>
          )}
        </Link>
      </div>
    </TooltipProvider>
  );

  return (
    <div className="crm-shell min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[240px]",
        )}
      >
        {sidebar}
        <Button
          onClick={toggleSidebar}
          type="button"
          variant="secondary"
          size="icon"
          className="absolute -right-3.5 top-[18px] grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </Button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 max-sm:hidden lg:hidden">
          <button
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[min(300px,86vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Phones: More opens a sheet with the account, every other section as tiles, then settings. */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="More"
          className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden"
        >
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex max-h-[92dvh] flex-col rounded-t-2xl bg-background shadow-2xl">
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between px-4 pt-2">
              <h2 className="text-lg font-semibold tracking-tight">More</h2>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* The profile reads as a card: who is signed in, their role, and a way into Account. */}
            <div className="px-4 pt-3">
              <Link
                href="/account"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors active:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none"
              >
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-base font-semibold text-primary-foreground ring-4 ring-primary/10">
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
                    <img src={user.avatar} alt="" className="size-full object-cover" />
                  ) : (
                    user.initials
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{user.name}</span>
                  <span className="mt-1 inline-block max-w-full truncate rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary first-letter:uppercase">
                    {user.role}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground">
                  Account
                  <ChevronRight aria-hidden="true" className="size-4" />
                </span>
              </Link>
            </div>
            <nav aria-label="All sections" className="flex-1 space-y-5 overflow-y-auto p-4">
              {moreGroups.map(([section, items]) => (
                <section key={section}>
                  {section && (
                    <h2 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                      {section}
                    </h2>
                  )}
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                    {items.map((item) => {
                      const Icon = icons[item.icon];
                      const active = [item.href, ...(item.match ?? [])].some(
                        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
                      );
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex h-12 items-center gap-3 px-3 text-sm font-medium transition-colors active:bg-muted",
                              active && "text-primary",
                            )}
                          >
                            <Icon className={cn("size-5", !active && "text-muted-foreground")} />
                            <span className="flex-1">{item.label}</span>
                            <ChevronRight
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <section>
                <h2 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">
                  Preferences
                </h2>
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-12 items-center gap-3 px-3 text-sm font-medium w-full text-left active:bg-muted"
                  >
                    {dark ? (
                      <Sun className="size-5 text-muted-foreground" />
                    ) : (
                      <Moon className="size-5 text-muted-foreground" />
                    )}
                    <span className="flex-1">{dark ? "Light mode" : "Dark mode"}</span>
                  </button>
                  <SignOutButton inMenu />
                </div>
              </section>
            </nav>
            <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </div>
      )}

      <div
        className={cn(
          "crm-shell-content transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]",
        )}
      >
        {/* Single premium header: title on the left, utilities on the right */}
        <header
          className={cn(
            "crm-shell-header sticky top-0 z-30 flex h-14 items-center gap-2 border-b sm:h-16 border-border bg-background/80 px-4 backdrop-blur-md transition-[background-color,box-shadow] duration-200 sm:gap-4 sm:px-5 lg:px-6",
            scrolled ? "shadow-xs" : "",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMobileOpen(true)}
            className="-ml-2 size-9 rounded-lg p-0 hover:bg-muted max-sm:hidden lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </Button>

          {/* PageHeader portals its title and description here */}
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center" />

          <div className="flex shrink-0 items-center gap-2 max-sm:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Toggle color theme"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <span aria-hidden className="mx-1 hidden h-6 w-px bg-border/70 sm:block" />

            <SignOutButton />
          </div>
        </header>

        <HeaderSlotContext.Provider value={headerSlot}>
          <main className="min-w-0 min-h-[calc(100vh-4rem)] max-sm:pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
        </HeaderSlotContext.Provider>
        {/* Phones: the usual app tab bar for the main sections; More opens the full menu. */}
        <nav
          aria-label="Main sections"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        >
          {navigation
            .filter((item) => item.href in tabLabels)
            .map((item) => {
              const Icon = icons[item.icon];
              const active = [item.href, ...(item.match ?? [])].some(
                (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
              );
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {tabLabels[item.href]}
                </Link>
              );
            })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            className="flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="size-5" />
            More
          </button>
        </nav>
      </div>
      <ToastProvider theme={dark ? "dark" : "light"} />
    </div>
  );
}
