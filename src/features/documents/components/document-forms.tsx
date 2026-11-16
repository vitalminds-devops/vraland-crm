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
import { notify } from "@/components/ui/toast";
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
}: {
  options: {
    contacts: Named[];
    properties: Named[];
    deals: Named[];
  };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileUp className="mr-2 size-4" />
        Upload document
      </Button>
      {open && (
        <Modal title="Upload document" close={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await uploadDocument(new FormData(e.currentTarget));
                if (r.success) router.push(`/documents/${r.data.id}`);
                else notify(r.error.message, "error");
              });
            }}
            className="grid gap-3"
          >
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
            <Input name="name" placeholder="Name (optional)" className={input} />
            <NativeSelect name="contactId" className={input}>
              <NativeSelectOption value="">No contact</NativeSelectOption>
              {options.contacts.map((v) => (
                <NativeSelectOption key={v.id} value={v.id}>
                  {v.firstName} {v.lastName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="propertyId" className={input}>
              <NativeSelectOption value="">No property</NativeSelectOption>
              {options.properties.map((v) => (
                <NativeSelectOption key={v.id} value={v.id}>
                  {v.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect name="dealId" className={input}>
              <NativeSelectOption value="">No deal</NativeSelectOption>
              {options.deals.map((v) => (
                <NativeSelectOption key={v.id} value={v.id}>
                  {v.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              required
              name="file"
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
              className={input}
            />
            <p className="text-xs text-muted-foreground">
              PDF, DOCX, JPEG, PNG, or TXT · maximum 15 MB
            </p>
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
