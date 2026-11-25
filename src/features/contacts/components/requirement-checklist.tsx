"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Eye, Plus, Trash2, Upload, X } from "lucide-react";
import {
  addContactRequirement,
  removeContactRequirement,
  seedContactRequirements,
  uploadRequirementDocument,
} from "../actions/requirement.actions";
import { validationFailure, type ActionResult } from "@/lib/types/action-result";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify, notifyLoading } from "@/components/ui/toast";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { defaultRequirementStatus, requiredDocumentTypes } from "../lib/contact-options";

type RequirementRow = {
  id: string;
  documentType: string;
  label: string;
  status: string;
  documentId: string | null;
  documentName: string | null;
  documentMimeType: string | null;
};

const previewableTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

const submittedStyle = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
const missingStyle = "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";

export function RequirementChecklist({
  contactId,
  requirements,
  canManage,
}: {
  contactId: string;
  requirements: RequirementRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [preview, setPreview] = useState<RequirementRow | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResult<unknown>>) => {
    startTransition(async () => {
      const toastId = notifyLoading("Saving document changes…", `contact-documents-${contactId}`);
      try {
        const result = await action();
        if (!result.success)
          notify("Document changes were not saved", "error", {
            id: toastId,
            description: result.error.message,
          });
        else {
          notify("Document changes saved.", "success", toastId);
          setShowAdd(false);
          router.refresh();
        }
      } catch {
        setUploadError(
          "Confirmation was not received. Refresh this checklist to check whether the document was saved before trying again.",
        );
        notify("Couldn't confirm document changes", "error", {
          id: toastId,
          description:
            "Refresh this checklist to check whether the document was saved before trying again.",
        });
      }
    });
  };

  // A requirement counts as submitted only when a file is attached.
  const submitted = requirements.filter((r) => r.documentId).length;
  const notSubmitted = requirements.length - submitted;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {requirements.length === 0
            ? "No documents tracked yet."
            : `${submitted} of ${requirements.length} submitted`}
        </span>
        {notSubmitted > 0 && (
          <span className={`rounded px-2 py-0.5 text-xs ${missingStyle}`}>
            {notSubmitted} not submitted
          </span>
        )}
        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            {requirements.length === 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => seedContactRequirements({ contactId }))}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
              >
                Add standard checklist
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAdd((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              <Plus className="size-3.5" />
              Add document
            </Button>
          </div>
        )}
      </div>

      {showAdd && canManage && <AddRequirementForm contactId={contactId} run={run} />}
      {uploadError && (
        <p role="alert" className="text-sm text-destructive">
          {uploadError}
        </p>
      )}

      {requirements.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {requirements.map((requirement) => (
            <li key={requirement.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{requirement.label}</p>
                {requirement.documentName && (
                  <p className="truncate text-xs text-muted-foreground">
                    {requirement.documentName}
                  </p>
                )}
              </div>
              {requirement.documentId ? (
                <span className={`rounded px-2 py-0.5 text-xs ${submittedStyle}`}>Submitted</span>
              ) : (
                <span className={`rounded px-2 py-0.5 text-xs ${missingStyle}`}>Not submitted</span>
              )}
              {requirement.documentId &&
                previewableTypes.has(requirement.documentMimeType ?? "") && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => setPreview(requirement)}
                  >
                    <Eye aria-hidden="true" className="size-3.5" /> Preview
                  </Button>
                )}
              {canManage && (
                <>
                  <label
                    className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium focus-within:ring-2 focus-within:ring-primary/25 hover:bg-muted ${pending ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <Upload aria-hidden="true" className="size-3.5" />
                    {requirement.documentId ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      aria-label={`Upload ${requirement.label}`}
                      disabled={pending}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        const form = new FormData();
                        form.set("id", requirement.id);
                        form.set("file", file);
                        setUploadError(null);
                        run(async () => {
                          const error = await documentFileError(file, requirementFileTypes);
                          if (error) {
                            setUploadError(error);
                            return validationFailure(error);
                          }
                          const result = await uploadRequirementDocument(form);
                          if (!result.success) setUploadError(result.error.message);
                          return result;
                        });
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    aria-label={`Remove ${requirement.label}`}
                    onClick={() => run(() => removeContactRequirement({ id: requirement.id }))}
                    className="size-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <DialogPopup
              aria-describedby={undefined}
              className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <DialogTitle className="truncate text-sm font-semibold">
                  {preview?.label}
                </DialogTitle>
                <div className="flex shrink-0 items-center gap-1">
                  {preview?.documentId && (
                    <a
                      href={`/api/documents/${preview.documentId}/download`}
                      aria-label="Download"
                      title="Download"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className: "px-2",
                      })}
                    >
                      <Download aria-hidden="true" className="size-4" />
                    </a>
                  )}
                  <DialogClose
                    aria-label="Close"
                    className={buttonVariants({ variant: "ghost", size: "sm", className: "px-2" })}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </DialogClose>
                </div>
              </header>
              {preview?.documentId &&
                (preview.documentMimeType?.startsWith("image/") ? (
                  <div className="grid flex-1 place-items-center overflow-auto bg-muted/40 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route */}
                    <img
                      src={`/api/documents/${preview.documentId}/download?inline=1`}
                      alt={preview.label}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <iframe
                    title={`Preview ${preview.label}`}
                    src={`/api/documents/${preview.documentId}/download?inline=1`}
                    className="w-full flex-1 bg-white"
                  />
                ))}
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </div>
  );
}

function AddRequirementForm({
  contactId,
  run,
}: {
  contactId: string;
  run: (action: () => Promise<ActionResult<unknown>>) => void;
}) {
  const [label, setLabel] = useState("");
  const [documentType, setDocumentType] = useState<string>(requiredDocumentTypes[0].documentType);
  const isCustom = !requiredDocumentTypes.some((item) => item.documentType === documentType);
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <NativeSelect
        aria-label="Document type"
        value={documentType}
        onChange={(event) => {
          const next = event.target.value;
          setDocumentType(next);
          const preset = requiredDocumentTypes.find((item) => item.documentType === next);
          if (preset) setLabel(preset.label);
        }}
        className="h-9 rounded-md border border-border bg-card px-2 text-sm"
      >
        {requiredDocumentTypes.map((item) => (
          <NativeSelectOption key={item.documentType} value={item.documentType}>
            {item.label}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="custom">Custom…</NativeSelectOption>
      </NativeSelect>
      <Input
        aria-label="Document name"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Document name"
        className="h-9 rounded-md border border-border bg-card px-2 text-sm"
      />
      <Button
        type="button"
        size="sm"
        disabled={label.trim().length < 2}
        onClick={() =>
          run(() =>
            addContactRequirement({
              contactId,
              documentType: isCustom
                ? `custom_${label.trim().toLowerCase().replace(/\s+/g, "_")}`
                : documentType,
              label: label.trim(),
              status: defaultRequirementStatus,
            }),
          )
        }
        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
      >
        Add
      </Button>
    </div>
  );
}
