"use client";

import { Download, Eye, FileText, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { notify, notifyLoading } from "@/components/ui/toast";
import { documentFileError } from "@/lib/storage/document-validation";
import { cn } from "@/lib/utils/cn";
import { manilaToday } from "@/lib/utils/manila-time";
import { formatDate } from "@/features/contacts/lib/helpers";

import { saveUserCertificate, saveUserDocument } from "../actions/settings.actions";

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  roles: string[];
};

type UserDocument = {
  id: string;
  name: string;
  documentType: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: Date;
  validFrom: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
};

const field = "grid min-w-0 gap-1.5 text-sm font-medium";
const fileTypes = ".pdf,.docx,.jpg,.jpeg,.png,.txt";
const previewableTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);
// Label styled as a button; disabled input inside greys it out.
const fileButton = (variant: "primary" | "secondary") =>
  cn(
    buttonVariants({ variant, size: "sm" }),
    "min-h-10 cursor-pointer gap-1.5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50 sm:min-h-8",
  );

function certificateStatus(certificate: UserDocument, today: string) {
  if (certificate.validFrom && certificate.validFrom > today)
    return {
      label: "Not yet valid",
      styles: "bg-muted text-muted-foreground",
    };
  if (!certificate.validUntil || certificate.validUntil < today)
    return { label: "Expired", styles: "bg-destructive/10 text-destructive" };
  const daysRemaining = Math.ceil(
    (new Date(`${certificate.validUntil}T00:00:00Z`).getTime() -
      new Date(`${today}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return daysRemaining <= 30
    ? { label: "Expiring soon", styles: "bg-amber-500/15 text-amber-800" }
    : { label: "Valid", styles: "bg-emerald-500/15 text-emerald-800" };
}

function formatSize(size: number | null) {
  if (size === null) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mimeType: string | null) {
  if (!mimeType) return "File";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("word")) return "Word";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType === "text/plain") return "Text";
  return "File";
}

function Section({
  title,
  description,
  count,
  action,
  empty,
  children,
}: {
  title: string;
  description: string;
  count: number;
  action: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {title}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardHeader>
      {count > 0 ? (
        <ul className="divide-y divide-border/50">{children}</ul>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );
}

function DocumentRow({
  document,
  details,
  actions,
  children,
}: {
  document: UserDocument;
  details?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const meta = [
    fileKind(document.mimeType),
    formatSize(document.fileSizeBytes),
    formatDate(document.createdAt),
  ].filter(Boolean);
  return (
    <li className="grid gap-3 p-4">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <FileText aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium [overflow-wrap:anywhere]">{document.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {details}
            {meta.join(" · ")}
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
          {actions}
          <a
            href={`/api/settings/user-documents/${document.id}/download`}
            aria-label={`Download ${document.name}`}
            title="Download"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "min-h-10 gap-1.5 sm:min-h-8",
            })}
          >
            <Download aria-hidden="true" size={15} /> Download
          </a>
        </div>
      </div>
      {children}
    </li>
  );
}

export function UserDocumentsWorkspace({
  user,
  documents,
}: {
  user: UserSummary;
  documents: UserDocument[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [preview, setPreview] = useState<UserDocument | null>(null);
  const previewButton = (document: UserDocument) =>
    previewableTypes.has(document.mimeType ?? "") && (
      <Button
        variant="ghost"
        size="sm"
        className="min-h-10 gap-1.5 sm:min-h-8"
        aria-label={`Preview ${document.name}`}
        onClick={() => setPreview(document)}
      >
        <Eye aria-hidden="true" size={15} /> Preview
      </Button>
    );
  const today = manilaToday();
  const certificates = documents.filter(
    (document) => document.documentType === "accreditation_certificate",
  );
  const otherDocuments = documents.filter(
    (document) => document.documentType !== "accreditation_certificate",
  );

  const uploadCertificate = (form: FormData, element: HTMLFormElement) => {
    form.set("userId", user.id);
    startTransition(async () => {
      const toastId = notifyLoading("Uploading certificate…", `certificate-${user.id}`);
      try {
        const file = form.get("file");
        const error =
          file instanceof File ? await documentFileError(file) : "Select a certificate file.";
        if (error) {
          notify("Certificate not accepted", "error", { id: toastId, description: error });
          return;
        }
        const result = await saveUserCertificate(form);
        notify(
          result.success
            ? "Certificate uploaded."
            : result.error.message || "Couldn't upload certificate.",
          result.success ? "success" : "error",
          toastId,
        );
        if (result.success) {
          element.reset();
          setCertificateOpen(false);
          router.refresh();
        }
      } catch {
        notify(
          "Upload confirmation was not received. Refresh the document list before uploading again.",
          "error",
          toastId,
        );
      }
    });
  };

  // Empty documentId uploads a new document; otherwise replaces that one.
  const uploadDocument = (input: HTMLInputElement, documentId = "") => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const form = new FormData();
    form.set("userId", user.id);
    form.set("documentId", documentId);
    form.set("file", file);
    const verb = documentId ? "replace" : "upload";
    startTransition(async () => {
      const toastId = notifyLoading(
        documentId ? "Replacing document…" : "Uploading document…",
        `user-document-${user.id}`,
      );
      try {
        const error = await documentFileError(file);
        if (error) {
          notify("Document not accepted", "error", { id: toastId, description: error });
          return;
        }
        const result = await saveUserDocument(form);
        notify(
          result.success
            ? `Document ${verb}d.`
            : result.error.message || `Couldn't ${verb} document.`,
          result.success ? "success" : "error",
          toastId,
        );
        if (result.success) router.refresh();
      } catch {
        notify(
          "Upload confirmation was not received. Refresh the document list before uploading again.",
          "error",
          toastId,
        );
      }
    });
  };

  return (
    <div className="grid gap-5">
      <Section
        title="Certificates"
        description="Accreditation certificates and validity dates."
        count={certificates.length}
        empty="No certificates yet. Add a certificate to record its number and validity dates."
        action={
          <Button
            variant="primary"
            size="sm"
            className="min-h-10 gap-1.5 sm:min-h-8"
            onClick={() => setCertificateOpen(true)}
          >
            <Plus aria-hidden="true" size={15} /> Add certificate
          </Button>
        }
      >
        {certificates.map((certificate) => {
          const status = certificateStatus(certificate, today);
          return (
            <DocumentRow
              key={certificate.id}
              document={certificate}
              actions={previewButton(certificate)}
              details={
                <>
                  <span className={`rounded-full px-2 py-0.5 font-medium ${status.styles}`}>
                    {status.label}
                  </span>
                  {certificate.certificateNumber && (
                    <span className="text-foreground">{certificate.certificateNumber}</span>
                  )}
                  <span>
                    {certificate.validFrom || "?"} – {certificate.validUntil || "?"} ·
                  </span>
                </>
              }
            />
          );
        })}
      </Section>

      <Section
        title="Other documents"
        description="PDF, Word (.docx), JPG, PNG or TXT. Up to 15 MB per file."
        count={otherDocuments.length}
        empty="No other documents yet. Upload a file to keep it with this user's records."
        action={
          <label className={fileButton("primary")}>
            <Upload aria-hidden="true" size={15} /> Upload document
            <input
              type="file"
              accept={fileTypes}
              aria-label="Upload document"
              className="sr-only"
              disabled={pending}
              onChange={(event) => uploadDocument(event.currentTarget)}
            />
          </label>
        }
      >
        {otherDocuments.map((document) => {
          return (
            <DocumentRow
              key={document.id}
              document={document}
              actions={
                <>
                  {previewButton(document)}
                  <label className={fileButton("secondary")}>
                    Replace
                    <input
                      type="file"
                      accept={fileTypes}
                      aria-label={`Replace ${document.name}`}
                      className="sr-only"
                      disabled={pending}
                      onChange={(event) => uploadDocument(event.currentTarget, document.id)}
                    />
                  </label>
                </>
              }
            />
          );
        })}
      </Section>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
            <DialogPopup className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
              <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <DialogTitle className="truncate text-sm font-semibold">
                  {preview?.name}
                </DialogTitle>
                <div className="flex shrink-0 items-center gap-1">
                  {preview && (
                    <a
                      href={`/api/settings/user-documents/${preview.id}/download`}
                      aria-label="Download"
                      title="Download"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className: "px-2",
                      })}
                    >
                      <Download aria-hidden="true" size={15} />
                    </a>
                  )}
                  <DialogClose
                    aria-label="Close"
                    className={buttonVariants({ variant: "ghost", size: "sm", className: "px-2" })}
                  >
                    <X aria-hidden="true" size={15} />
                  </DialogClose>
                </div>
              </header>
              {preview &&
                (preview.mimeType?.startsWith("image/") ? (
                  <div className="grid flex-1 place-items-center overflow-auto bg-muted/40 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route */}
                    <img
                      src={`/api/settings/user-documents/${preview.id}/preview`}
                      alt={preview.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <iframe
                    title={`Preview ${preview.name}`}
                    src={`/api/settings/user-documents/${preview.id}/preview`}
                    className="w-full flex-1 bg-white"
                  />
                ))}
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>

      <Dialog open={certificateOpen} onOpenChange={setCertificateOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup
              aria-describedby={undefined}
              className="w-full max-w-md rounded-lg border bg-card p-5 text-left shadow-xl"
            >
              <header className="flex items-center justify-between gap-4">
                <DialogTitle className="text-lg font-semibold">Add certificate</DialogTitle>
                <DialogClose
                  aria-label="Close"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                >
                  <X aria-hidden="true" size={16} />
                </DialogClose>
              </header>
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  uploadCertificate(new FormData(event.currentTarget), event.currentTarget);
                }}
              >
                <label className={field}>
                  Certificate number
                  <Input required name="certificateNumber" maxLength={180} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={field}>
                    Valid from
                    <DatePicker required name="validFrom" />
                  </label>
                  <label className={field}>
                    Valid until
                    <DatePicker required name="validUntil" />
                  </label>
                </div>
                <label className={field}>
                  Certificate file
                  <Input required type="file" name="file" accept={fileTypes} />
                  <span className="text-xs font-normal text-muted-foreground">
                    PDF, Word (.docx), JPG, PNG or TXT. Up to 15 MB.
                  </span>
                </label>
                <div className="mt-2 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="primary" disabled={pending}>
                    {pending ? "Uploading…" : "Upload certificate"}
                  </Button>
                </div>
              </form>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
