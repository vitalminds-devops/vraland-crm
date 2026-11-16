"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { storedImageAccept } from "@/lib/storage/image-uploads";

type Props = {
  label: string;
  hint?: string;
  error?: string;
  /** The stored photo, as the server last reported it. */
  currentUrl: string | null;
  /** The chosen file, or null when the choice is cleared. */
  onSelect: (file: File | null) => void;
  /** Clears a cover that is already stored. Absent on a create form. */
  onRemove?: () => void;
  /** True while a removal is in flight. */
  removing?: boolean;
  disabled?: boolean;
};

export function CoverImageField({
  label,
  hint,
  error,
  currentUrl,
  onSelect,
  onRemove,
  removing = false,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const shownUrl = previewUrl ?? currentUrl;

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    onSelect(file);
  };

  /** Drop the staged choice and fall back to whatever is already stored. */
  const undoChoice = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    onSelect(null);
  };

  return (
    <div className="block">
      <div className="mb-3 space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      <Input
        ref={inputRef}
        type="file"
        name="coverImage"
        aria-label={label}
        accept={storedImageAccept}
        disabled={disabled}
        onChange={(event) => choose(event.target.files?.[0])}
        className="hidden"
      />
      <div className="w-full max-w-2xl rounded-xl border border-border bg-muted/20 p-2">
        {shownUrl ? (
          <div className="aspect-[16/7] overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- The image optimizer cannot fetch authenticated photos. */}
            <img src={shownUrl} alt={`${label} preview`} className="h-full w-full object-cover" />
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="min-h-44 h-auto w-full flex-col gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-6 hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
              <ImagePlus aria-hidden="true" className="size-5" />
            </span>
            <span className="space-y-1 text-center">
              <span className="block text-sm font-medium">Choose cover photo</span>
              <span className="block text-xs font-normal text-muted-foreground">
                JPEG, PNG or WebP · Up to 5 MB
              </span>
            </span>
          </Button>
        )}

        {shownUrl && (
          <div className="flex flex-wrap items-center gap-2 px-1 pt-3 pb-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" className="mr-1.5 size-4" />
              Replace photo
            </Button>

            {previewUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={undoChoice}
              >
                Undo
              </Button>
            )}

            {currentUrl && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || removing}
                onClick={onRemove}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {removing ? "Removing…" : "Remove photo"}
              </Button>
            )}

            <p className="ml-auto text-xs text-muted-foreground">Up to 5 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
