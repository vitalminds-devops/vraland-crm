"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";

export function DocumentPreview({
  id,
  name,
  mimeType,
}: {
  id: string;
  name: string;
  mimeType: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const image = mimeType === "image/jpeg" || mimeType === "image/png";
  const source = `/api/documents/${id}/download?inline=1`;

  if (failed || (!image && mimeType !== "application/pdf")) {
    return (
      <p className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        {failed ? "File not found. Upload it again." : "Preview is unavailable for this file type."}{" "}
        {!failed && (
          <a
            href={`/api/documents/${id}/download`}
            className="font-medium text-primary hover:underline"
          >
            Download document
          </a>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-muted/30">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- The authenticated file route cannot be fetched by the image optimizer.
          <img
            src={source}
            alt={`Preview of ${name}`}
            onError={() => setFailed(true)}
            // The image can fail before hydration, when onError is not yet attached.
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setFailed(true);
            }}
            className="mx-auto max-h-[70vh] max-w-full object-contain"
          />
        ) : (
          <iframe
            title={`Preview of ${name}`}
            src={source}
            onError={() => setFailed(true)}
            className="h-[70vh] min-h-96 w-full border-0"
          />
        )}
      </div>
      <a
        href={source}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Open in new tab <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>
    </div>
  );
}
