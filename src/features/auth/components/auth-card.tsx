import Image from "next/image";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  accent,
  description,
  children,
  footer,
}: {
  title: string;
  /** A second title line in the brand colour. */
  accent?: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-[400px]">
      <Image
        src="/images/vra_logo.png"
        alt="VRA Land Inc."
        width={40}
        height={40}
        priority
        className="size-9 object-contain"
      />

      <h1 className="mt-5 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground">
        {title}
        {accent && (
          <>
            <br />
            <span className="text-primary">{accent}</span>
          </>
        )}
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{description}</p>

      <div className="mt-7">{children}</div>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </div>
  );
}
