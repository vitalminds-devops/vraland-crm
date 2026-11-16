"use client";

import { useState } from "react";

export function DevelopmentCover({ src, initial }: { src: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
      <img
        src={src}
        alt=""
        // A server-rendered image can fail before hydration attaches onError; catch that on mount.
        ref={(img) => {
          if (img?.complete && !img.naturalWidth) setFailed(true);
        }}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="relative grid h-full place-content-center overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
      <span
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <span className="text-[28px] font-black tracking-tighter text-primary/25 drop-shadow-sm">
        {initial}
      </span>
    </span>
  );
}
