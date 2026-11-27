"use client";

import { Check, FileText, Loader2, Plus, ScanLine, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { extraDocumentTypes, requiredDocumentLabel } from "@/features/contacts/lib/contact-options";
import { cn } from "@/lib/utils/cn";
import { groupDigits } from "@/lib/utils/group-digits";

import type { OpportunityDraft } from "../queries/opportunity.queries";
import { Field, fieldClass } from "./opportunity-field";

/** Matches MAX_EXTRA_FILES on the server. */
const MAX_EXTRAS = 3;

export type IdScanStatus = {
  state: "idle" | "reading" | "found" | "not-found" | "error";
  progress?: number;
};
export type ExtraDocument = { file: File; type: string };

/** One document as a single row: name and status on the left, an upload button on the right. */
function FileRow({
  label,
  name,
  onFile,
  multiple,
  onPick,
  picked = "",
}: {
  label: string;
  name: string;
  onFile?: boolean;
  multiple?: boolean;
  onPick?: (files: File[]) => void;
  picked?: string;
}) {
  const required = onFile === false;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 text-sm">
        {label}
        {required && !picked && <span className="text-destructive"> *</span>}
        {picked ? (
          <span className="block truncate text-xs text-muted-foreground">{picked}</span>
        ) : (
          onFile && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <Check aria-hidden="true" className="size-3.5" /> On file
            </span>
          )
        )}
      </span>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1 text-xs font-medium focus-within:ring-2 focus-within:ring-primary/25 hover:bg-muted">
        <Upload aria-hidden="true" className="size-3.5" />
        {picked || onFile ? "Replace" : "Upload"}
        {/* Required files are checked by the Next button: a hidden step cannot show the browser's prompt. */}
        <input
          type="file"
          name={name}
          aria-label={label}
          accept=".pdf,.jpg,.jpeg,.png"
          multiple={multiple}
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onPick?.(files);
          }}
        />
      </label>
    </div>
  );
}

/** The ID about to be uploaded, or the one on file when nothing new is picked. */
function IdPreview({
  file,
  onFile,
}: {
  file: File | null;
  onFile: { id: string; mimeType: string | null } | null;
}) {
  // Each effect run makes and revokes its own URL; a memoised one stays revoked after Strict Mode's re-run.
  const preview = useRef<HTMLImageElement & HTMLIFrameElement>(null);
  useEffect(() => {
    if (!file || !preview.current) return;
    const url = URL.createObjectURL(file);
    preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [broken, setBroken] = useState(false);

  const box = "h-48 w-full rounded-lg border border-border/60 bg-muted/30";
  if (file)
    return file.type === "application/pdf" ? (
      <iframe ref={preview} title="ID preview" className={box} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
      <img ref={preview} alt="ID preview" className={cn(box, "object-contain")} />
    );
  if (onFile?.mimeType?.startsWith("image/") && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route
      <img
        src={`/api/documents/${onFile.id}/download`}
        alt="ID on file"
        onError={() => setBroken(true)}
        className={cn(box, "object-contain")}
      />
    );
  if (onFile)
    return (
      <a
        href={`/api/documents/${onFile.id}/download`}
        className="text-xs font-medium text-primary hover:underline"
      >
        Open the ID on file
      </a>
    );
  return null;
}

/** Step 1 of Move to Opportunity: TIN, PRC license, the valid ID, the appointment form and extras. */
export function OpportunityDocumentsStep({
  active,
  draft,
  restoredFields,
  tinNumber,
  onTinNumberChange,
  idFile,
  onPickId,
  scanStatus,
  appointmentFile,
  onAppointmentFileChange,
  extras,
  onExtrasChange,
  nextType,
  onNextTypeChange,
}: {
  active: boolean;
  draft: OpportunityDraft;
  restoredFields: Record<string, string>;
  tinNumber: string;
  onTinNumberChange: (value: string) => void;
  idFile: File | null;
  onPickId: (file: File | null) => void;
  scanStatus: IdScanStatus;
  appointmentFile: File | null;
  onAppointmentFileChange: (file: File | null) => void;
  extras: ExtraDocument[];
  onExtrasChange: Dispatch<SetStateAction<ExtraDocument[]>>;
  nextType: string;
  onNextTypeChange: (value: string) => void;
}) {
  return (
    // Stays mounted while hidden so its files are still submitted.
    <fieldset className={cn("grid gap-3", !active && "hidden")}>
      <legend className="sr-only">Documents</legend>
      <Field label="TIN number" required>
        <Input
          name="tinNumber"
          inputMode="numeric"
          value={groupDigits(tinNumber)}
          onChange={(event) => onTinNumberChange(groupDigits(event.target.value))}
          required={active}
          maxLength={50}
          placeholder="Enter the contact's TIN"
          className={fieldClass}
        />
      </Field>
      <Field label="PRC license number">
        <Input
          name="prcLicenseNumber"
          defaultValue={restoredFields.prcLicenseNumber ?? draft.prcLicenseNumber}
          maxLength={50}
          placeholder="If applicable"
          className={fieldClass}
        />
      </Field>
      <div className="divide-y divide-border/60 rounded-lg border border-border/60 px-3">
        <div>
          <FileRow
            label={requiredDocumentLabel("valid_id")}
            name="validId"
            onFile={draft.onFile.validId}
            picked={idFile?.name}
            onPick={(files) => onPickId(files[0] ?? null)}
          />
          {(idFile || draft.onFile.validIdFile) && (
            <div className="pb-3">
              <IdPreview file={idFile} onFile={draft.onFile.validIdFile} />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p
                  role="status"
                  aria-atomic="true"
                  className="inline-flex items-start gap-1.5 text-xs text-muted-foreground"
                >
                  {scanStatus.state === "reading" ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-3.5 animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <ScanLine aria-hidden="true" className="size-3.5" />
                  )}
                  <span>
                    {scanStatus.state === "reading"
                      ? `Reading ID address… ${scanStatus.progress || 0}%`
                      : scanStatus.state === "found"
                        ? "Address detected. Review the Address step."
                        : scanStatus.state === "not-found"
                          ? "No address found. Retake it closer, in even light, or enter it in the Address step."
                          : scanStatus.state === "error"
                            ? "Couldn't read this ID. Retake it closer and steady, or enter the address."
                            : "The ID address will be scanned automatically."}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
        <FileRow
          label={requiredDocumentLabel("client_appointment_form")}
          name="appointmentForm"
          onFile={draft.onFile.appointmentForm}
          picked={appointmentFile?.name}
          onPick={(files) => onAppointmentFileChange(files[0] ?? null)}
        />
        <div className="grid gap-2 py-2.5">
          <span className="text-sm">
            Other documents
            <span className="ml-2 text-xs text-muted-foreground">
              {extras.length ? `${extras.length}/${MAX_EXTRAS}` : "Optional"}
            </span>
          </span>
          {extras.length > 0 && (
            <ul className="grid gap-2">
              {extras.map((extra, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-2"
                >
                  <span className="grid size-8 shrink-0 place-content-center rounded-md bg-background text-muted-foreground">
                    <FileText aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {requiredDocumentLabel(extra.type)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {extra.file.name} ·{" "}
                      {extra.file.size < 1024 * 1024
                        ? `${Math.max(1, Math.round(extra.file.size / 1024))} KB`
                        : `${(extra.file.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${extra.file.name}`}
                    onClick={() =>
                      onExtrasChange((current) => current.filter((_, i) => i !== index))
                    }
                    className="grid size-7 shrink-0 place-content-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {extras.length < MAX_EXTRAS && (
            // The type is picked first, so every file is filed correctly.
            <div className="flex items-center gap-2">
              <NativeSelect
                aria-label="Document type"
                value={nextType}
                onChange={(event) => onNextTypeChange(event.target.value)}
                className={cn(fieldClass, "h-8 py-1 pr-8 text-xs")}
                wrapperClassName="min-w-0 flex-1"
              >
                <NativeSelectOption value="">Select type</NativeSelectOption>
                {extraDocumentTypes.map((item) => (
                  <NativeSelectOption key={item.documentType} value={item.documentType}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <label
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-xs font-medium focus-within:ring-2 focus-within:ring-primary/25",
                  nextType ? "cursor-pointer hover:bg-muted" : "pointer-events-none opacity-50",
                )}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add file
                <input
                  type="file"
                  aria-label="Other documents"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={!nextType}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !nextType) return;
                    onExtrasChange((current) =>
                      [...current, { file, type: nextType }].slice(0, MAX_EXTRAS),
                    );
                    onNextTypeChange("");
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </fieldset>
  );
}
