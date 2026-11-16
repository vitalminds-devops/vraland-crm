"use client";

import { Eye, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FIRST_NAME_TAG, SAMPLE_FIRST_NAME, render } from "../lib/merge-fields";

/** Puts the first-name tag at the cursor of the field with id `target`, so nobody types braces. */
export function InsertFirstName({
  target,
  onInsert,
}: {
  target: string;
  onInsert: (value: string) => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="gap-1.5"
      onClick={() => {
        const field = document.getElementById(target) as
          HTMLInputElement | HTMLTextAreaElement | null;
        if (!field) return;
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        onInsert(field.value.slice(0, start) + FIRST_NAME_TAG + field.value.slice(end));
        const caret = start + FIRST_NAME_TAG.length;
        requestAnimationFrame(() => {
          field.focus();
          field.setSelectionRange(caret, caret);
        });
      }}
    >
      <UserRound aria-hidden="true" className="size-3.5" />
      Insert first name
    </Button>
  );
}

/** How the message reads for one client, with a sample first name. */
export function MessagePreview({
  subject,
  body,
  channel,
}: {
  subject?: string;
  body: string;
  channel: "email" | "sms";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-muted/30 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Eye aria-hidden="true" className="size-3.5" />
        Preview for {SAMPLE_FIRST_NAME}
      </p>
      {body.trim() ? (
        channel === "sms" ? (
          <p className="max-w-xs whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-sm shadow-xs">
            {render(body, SAMPLE_FIRST_NAME)}
          </p>
        ) : (
          <div className="rounded-md bg-card p-4 text-sm shadow-xs">
            {subject !== undefined && (
              <p className="mb-3 border-b border-[var(--border)] pb-2 font-semibold">
                {render(subject, SAMPLE_FIRST_NAME) || "No subject"}
              </p>
            )}
            <p className="whitespace-pre-wrap">{render(body, SAMPLE_FIRST_NAME)}</p>
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Your message shows here as you type.</p>
      )}
    </div>
  );
}

/** Shown where a template is required but none exists yet; opens in a new tab so the form is kept. */
export function NoTemplateYet({ kind }: { kind: "email" | "sms" }) {
  const router = useRouter();
  const href = kind === "email" ? "/marketing/email-templates/new" : "/marketing/sms-templates/new";
  return (
    <p className="text-xs text-muted-foreground">
      No {kind === "email" ? "email" : "SMS"} templates yet.{" "}
      <Link href={href} target="_blank" className="font-medium text-primary hover:underline">
        Create one
      </Link>{" "}
      in a new tab, then {/* A refresh re-reads the list without clearing what is typed here. */}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="font-medium text-primary hover:underline"
      >
        reload this list
      </button>
      .
    </p>
  );
}
