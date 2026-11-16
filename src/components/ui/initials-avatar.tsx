import { cn } from "@/lib/utils/cn";

/** Circular avatar showing a person's photo, or their initials when there is none. */
export function InitialsAvatar({
  initials,
  src,
  className,
}: {
  initials: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/15",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
