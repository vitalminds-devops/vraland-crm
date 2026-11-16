"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface Section {
  id: string;
  label: string;
}

interface FormNavigationProps {
  sections: Section[];
  headerOffset?: number;
  /** Accessible label for the navigation landmark. */
  navLabel?: string;
}

const DEFAULT_HEADER_OFFSET = 112;

const PROGRAMMATIC_SCROLL_LOCK_MS = 700;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FormNavigation({
  sections,
  headerOffset = DEFAULT_HEADER_OFFSET,
  navLabel = "Form sections",
}: FormNavigationProps) {
  const [activeSection, setActiveSection] = useState(() => sections[0]?.id ?? "");

  const sectionIdsKey = sections.map((section) => section.id).join("|");

  const programmaticScrollUntilRef = useRef(0);

  const setActive = useCallback((id: string) => {
    setActiveSection((current) => (current === id ? current : id));
  }, []);

  // ----- Scroll-spy ---------------------------------------------------------
  useEffect(() => {
    const ids = sectionIdsKey ? sectionIdsKey.split("|") : [];

    const computeActive = () => {
      if (Date.now() < programmaticScrollUntilRef.current) return;

      const viewportLine = headerOffset + 1; // 1px tolerance below the offset
      let active = ids[0] ?? "";
      let lastTop = Number.NEGATIVE_INFINITY;

      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;

        const { top } = element.getBoundingClientRect();

        // The section whose top is the closest above the viewport line wins.
        if (top - viewportLine <= 0 && top > lastTop) {
          active = id;
          lastTop = top;
        }
      }

      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && ids.length > 0) {
        active = ids[ids.length - 1];
      }

      // Nothing has scrolled past the line yet (top of page): first section.
      if (lastTop === Number.NEGATIVE_INFINITY && window.scrollY <= 1) {
        active = ids[0] ?? "";
      }

      setActive(active);
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        computeActive();
      });
    };

    computeActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Recompute once fonts/images settle so positions are accurate.
    const settle = window.setTimeout(computeActive, 250);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [headerOffset, sectionIdsKey, setActive]);

  // ----- Keep the active item visible inside the nav ------------------------
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeLinkRef.current?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeSection]);

  // ----- Click navigation ---------------------------------------------------
  const handleNavigate = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      event.preventDefault();
      const element = document.getElementById(id);
      if (!element) return;

      const smooth = !prefersReducedMotion();
      programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_LOCK_MS;
      setActive(id);

      // Offset the target so its heading clears the sticky header.
      if (smooth) {
        const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
        window.scrollTo({ top, behavior: "smooth" });
      } else {
        element.scrollIntoView({ behavior: "auto", block: "start" });
      }

      // Reflect the target in the URL without adding history noise.
      if (window.history.replaceState) {
        window.history.replaceState(null, "", `#${id}`);
      }
    },
    [headerOffset, setActive],
  );

  if (sections.length === 0) return null;

  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <nav
        aria-label={navLabel}
        className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-1 overflow-y-auto pr-1"
      >
        <p className="mb-3 text-sm font-semibold text-muted-foreground">{navLabel}</p>
        {sections.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              ref={isActive ? activeLinkRef : undefined}
              aria-current={isActive ? "location" : undefined}
              onClick={(event) => handleNavigate(event, section.id)}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                isActive ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {section.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
