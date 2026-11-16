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

  const sidebar = (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        <Image
          src="/images/vra_logo.png"
          alt="VRA Land Inc. logo"
          width={36}
          height={36}
          priority
          className="size-9 shrink-0 object-contain"
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
        className="sidebar-nav flex-1 overflow-y-auto px-3 py-4 [@media(max-height:860px)]:py-2"
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
                  <div aria-hidden className="mx-auto my-3 h-px w-8 bg-sidebar-border/60" />
                )}
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors mb-0.5",
                    active
                      ? "bg-sidebar-active font-medium text-sidebar-active-foreground"
                      : "font-medium text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    collapsed && !mobileOpen && "justify-center px-0",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                  {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
                </Link>
              </div>
            );
          });
        })()}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/account"
          onClick={() => setMobileOpen(false)}
          title="Account settings"
          className={cn(
            "group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-sidebar-hover focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-none",
            collapsed ? "justify-center bg-transparent p-1" : "bg-sidebar-hover/60",
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
    </>
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
          className="absolute -right-3 top-[76px] grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </Button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
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

      <div
        className={cn(
          "crm-shell-content transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[240px]",
        )}
      >
        {/* Single premium header: title on the left, utilities on the right */}
        <header
          className={cn(
            "crm-shell-header sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md transition-[background-color,box-shadow] duration-200 sm:gap-4 sm:px-5 lg:px-6",
            scrolled ? "shadow-xs" : "",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </Button>

          {/* PageHeader portals its title and description here */}
          <div ref={setHeaderSlot} className="flex min-w-0 flex-1 items-center" />

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
          <main className="min-w-0 min-h-[calc(100vh-4rem)]">{children}</main>
        </HeaderSlotContext.Provider>
      </div>
      <ToastProvider theme={dark ? "dark" : "light"} />
    </div>
  );
}
