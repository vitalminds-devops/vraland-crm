import { MapPin } from "lucide-react";
import Image from "next/image";

import { ToastProvider } from "@/components/ui/toast";

/** Our developments, shown in turn on the sign-in page (fade timing lives in globals.css). */
const projects = [
  {
    name: "Sotera",
    src: "/images/sotera-dusk.jpg",
    alt: "Sotera condominium towers at dusk",
    fade: "showcase-out",
  },
  {
    name: "Fairfield",
    src: "/images/fairfield.jpg",
    alt: "Fairfield condominium towers at sunset",
    fade: "showcase-in",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden bg-slate-950">
        {/* The featured project also fills the page, blurred, and fades in step with the card. */}
        {projects.map((project) => (
          <div
            key={project.name}
            aria-hidden="true"
            className={`absolute inset-0 -z-20 ${project.fade}`}
          >
            <Image
              src={project.src}
              alt=""
              fill
              sizes="100vw"
              className="scale-110 object-cover blur-[8px]"
            />
          </div>
        ))}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(2,6,23,0.82),rgba(15,23,42,0.55)_55%,rgba(2,6,23,0.82))]"
        />

        {/* Desktop cards share one height; mobile keeps room for the form and keyboard. */}
        <div className="mx-auto grid w-full max-w-[1520px] gap-6 px-3 py-4 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(420px,1fr)] lg:grid-rows-[min(760px,calc(100dvh-64px))]">
          <section className="relative hidden overflow-hidden rounded-3xl shadow-2xl ring-1 shadow-black/40 ring-white/15 lg:block">
            {projects.map((project, index) => (
              <div key={project.name} className={`absolute inset-0 ${project.fade}`}>
                <Image
                  src={project.src}
                  alt={project.alt}
                  fill
                  priority={index === 0}
                  quality={90}
                  sizes="65vw"
                  className="object-cover"
                />
                <div className="absolute top-7 left-7 inline-flex items-center gap-2 rounded-full bg-slate-950/45 py-1.5 pr-4 pl-3 text-sm text-white ring-1 ring-white/15 backdrop-blur-md">
                  <MapPin aria-hidden="true" className="size-4 text-white/80" />
                  <span className="text-white/70">Featured project</span>
                  <span className="font-semibold">{project.name}</span>
                </div>
              </div>
            ))}
            {/* Readable text over either photo. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.25),rgba(2,6,23,0)_20%,rgba(2,6,23,0.1)_45%,rgba(2,6,23,0.75)_70%,rgba(2,6,23,0.95))]"
            />
            {/* Which project is showing. */}
            <div aria-hidden="true" className="absolute top-9 right-7 flex gap-1.5">
              {projects.map((project) => (
                <span
                  key={project.name}
                  className="h-1 w-8 overflow-hidden rounded-full bg-white/30"
                >
                  <span className={`block h-full w-full bg-white ${project.fade}`} />
                </span>
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-10 text-white xl:p-12">
              <h2 className="text-[clamp(2.25rem,5vh,3.25rem)] leading-[1.1] font-semibold tracking-[-0.02em]">
                VRA Land CRM
              </h2>
              <p className="mt-2 text-base text-white/70">Sales and property management</p>
            </div>
          </section>

          {/* Desktop scrolls inside the card; mobile uses the page's natural scroll. */}
          <section className="relative flex flex-col overflow-x-hidden rounded-2xl bg-white px-5 py-6 shadow-2xl shadow-black/40 sm:rounded-3xl sm:px-10 sm:py-8 lg:overflow-y-auto dark:bg-card">
            {/* Soft glows in two corners, clipped in their own layer so they never add scroll. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="absolute -top-28 -right-28 size-72 rounded-full bg-primary/10 blur-3xl" />
            </div>
            <div className="relative my-auto flex w-full justify-center">{children}</div>
            <p className="relative mt-6 text-center text-xs text-muted-foreground">
              © 2026 VRA Land Inc. All rights reserved.
            </p>
          </section>
        </div>
      </main>
      {/* Outside the grid: Sonner renders a <section> that would become a third grid cell. The CRM shell mounts its own. */}
      <ToastProvider />
    </>
  );
}
