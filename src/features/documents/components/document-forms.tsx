"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, FileUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify, notifyLoading } from "@/components/ui/toast";
import {
  documentFileError,
  documentFileTypes,
  requirementFileTypes,
} from "@/lib/storage/document-validation";
import { documentTypeOptions } from "@/features/contacts/lib/contact-options";
import { archiveDocument, restoreDocument, uploadDocument } from "../actions/document.actions";
type Named = {
  id: string;
  name?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
};
const input = "w-full rounded-md border bg-background px-3 py-2 text-sm";
export function DocumentUpload({
  options,
  shared = false,
}: {
  shared?: boolean;
  options?: {
    contacts: Named[];
    properties: Named[];
    deals: Named[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileUp className="mr-2 size-4" />
        {shared ? "Upload file" : "Upload document"}
      </Button>
      {open && (
        <Modal
          title={shared ? "Upload shared file" : "Upload document"}
          close={() => setOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setError(null);
              start(async () => {
                const toastId = notifyLoading("Uploading document…", "upload-document");
                try {
                  const file = form.get("file");
                  const fileError =
                    file instanceof File
                      ? await documentFileError(
                          file,
                          shared ? requirementFileTypes : documentFileTypes,
                        )
                      : "Select a file to upload.";
                  if (fileError) {
                    setError(fileError);
                    notify("Document not accepted", "error", {
                      id: toastId,
                      description: fileError,
                    });
                    return;
                  }
                  const r = await uploadDocument(form);
                  if (r.success) {
                    notify("Document uploaded.", "success", toastId);
                    router.push(`/documents/${r.data.id}`);
                  } else {
                    setError(r.error.message);
                    notify("Document was not uploaded", "error", {
                      id: toastId,
                      description: r.error.message,
                    });
                  }
                } catch {
                  setError(
                    `Upload confirmation was not received. Check Documents before uploading again. Accepted formats: ${shared ? "PDF, JPG or PNG" : "PDF, DOCX, JPG, PNG or TXT"}; maximum 15 MB per file.`,
                  );
                  notify("Could not confirm upload", "error", {
                    id: toastId,
                    description:
                      "Check Documents before uploading again. Your entries and selected file are still here.",
                  });
                }
              });
            }}
            className="grid gap-3"
          >
            {shared && (
              <>
                <input type="hidden" name="library" value="shared" />
                <input type="hidden" name="documentType" value="general" />
                <input type="hidden" name="contactId" value="" />
                <input type="hidden" name="propertyId" value="" />
                <input type="hidden" name="dealId" value="" />
                <p className="text-sm text-muted-foreground">
                  Files are available to everyone in your organization. Upload forms, templates or
                  reference materials here. Keep personal client documents on the client record.
                </p>
              </>
            )}
            {!shared && (
              <>
                <NativeSelect
                  required
                  name="documentType"
                  aria-label="Type"
                  defaultValue=""
                  className={input}
                >
                  <NativeSelectOption value="" disabled>
                    Select type
                  </NativeSelectOption>
                  {documentTypeOptions.map((item) => (
                    <NativeSelectOption key={item.documentType} value={item.documentType}>
                      {item.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect name="contactId" className={input}>
                  <NativeSelectOption value="">No contact</NativeSelectOption>
                  {options?.contacts.map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {v.firstName} {v.lastName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect name="propertyId" className={input}>
                  <NativeSelectOption value="">No property</NativeSelectOption>
                  {options?.properties.map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {v.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect name="dealId" className={input}>
                  <NativeSelectOption value="">No deal</NativeSelectOption>
                  {options?.deals.map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {v.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </>
            )}
            <label className="grid gap-1 text-sm">
              File name (optional)
              <Input
                name="name"
                placeholder={shared ? "Use the uploaded file name" : "Use the document type"}
                maxLength={220}
                className={input}
              />
            </label>
            <label className="grid gap-1 text-sm">
              File
              <Input
                required
                name="file"
                type="file"
                accept={shared ? ".pdf,.jpg,.jpeg,.png" : ".pdf,.docx,.jpg,.jpeg,.png,.txt"}
                onInvalid={() =>
                  notify("Choose a document", "error", {
                    id: "upload-document",
                    description: shared
                      ? "Select a PDF, JPG or PNG file up to 15 MB."
                      : "Select a PDF, DOCX, JPG, PNG or TXT file up to 15 MB.",
                  })
                }
                className={input}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {shared ? "PDF, JPEG or PNG" : "PDF, DOCX, JPEG, PNG, or TXT"} · maximum 15 MB
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              disabled={pending}
              className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              {pending ? "Uploading…" : "Upload securely"}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ArchiveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        confirm("Archive this document?") &&
        start(async () => {
          const r = await archiveDocument(id);
          if (!r.success) {
            notify(r.error.message || "Unable to archive.", "error");
            return;
          }
          notify("Document archived.", "success");
          router.refresh();
        })
      }
    >
      <Archive className="mr-1.5 size-3.5" />
      Archive
    </Button>
  );
}
export function RestoreButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await restoreDocument(id);
          if (!r.success) {
            notify(r.error.message || "Unable to restore.", "error");
            return;
          }
          notify("Document restored.", "success");
          router.refresh();
        })
      }
    >
      <RotateCcw className="mr-1.5 size-3.5" />
      Restore
    </Button>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <DialogPopup
            aria-describedby={undefined}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-card p-6"
          >
            <header className="mb-5 flex justify-between">
              <DialogTitle className="font-semibold">{title}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={close}
                aria-label="Close"
                className="size-auto"
              >
                <X className="size-5" />
              </Button>
            </header>
            {children}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
