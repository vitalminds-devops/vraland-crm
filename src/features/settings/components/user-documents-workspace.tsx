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
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

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
    "cursor-pointer gap-1.5 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50",
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
    (new Date(`${certificate.validUntil}T00:00:00`).getTime() -
      new Date(`${today}T00:00:00`).getTime()) /
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
  count,
  action,
  empty,
  children,
}: {
  title: string;
  count: number;
  action: ReactNode;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
            {count}
          </span>
        </h2>
        {action}
      </CardHeader>
      {count > 0 ? (
        <ul className="divide-y divide-border/50">{children}</ul>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
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
    document.createdAt.toLocaleDateString(),
  ].filter(Boolean);
  return (
    <li className="grid gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <FileText aria-hidden="true" size={18} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-medium">{document.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {details}
            {meta.join(" · ")}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          <a
            href={`/api/settings/user-documents/${document.id}/download`}
            aria-label={`Download ${document.name}`}
            title="Download"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "px-2" })}
          >
            <Download aria-hidden="true" size={15} />
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
        className="gap-1.5"
        aria-label={`Preview ${document.name}`}
        onClick={() => setPreview(document)}
      >
        <Eye aria-hidden="true" size={15} /> Preview
      </Button>
    );
  const today = new Date().toISOString().slice(0, 10);
  const certificates = documents.filter(
    (document) => document.documentType === "accreditation_certificate",
  );
  const otherDocuments = documents.filter(
    (document) => document.documentType !== "accreditation_certificate",
  );

  const uploadCertificate = (form: FormData, element: HTMLFormElement) => {
    form.set("userId", user.id);
    startTransition(async () => {
      const result = await saveUserCertificate(form);
      notify(
        result.success
          ? "Certificate uploaded."
          : result.error.message || "Couldn't upload certificate.",
        result.success ? "success" : "error",
      );
      if (result.success) {
        element.reset();
        setCertificateOpen(false);
        router.refresh();
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
      const result = await saveUserDocument(form);
      notify(
        result.success
          ? `Document ${verb}d.`
          : result.error.message || `Couldn't ${verb} document.`,
        result.success ? "success" : "error",
      );
      if (result.success) router.refresh();
    });
  };

  return (
    <div className="mt-6 grid gap-6">
      <Section
        title="Certificates"
        count={certificates.length}
        empty="No certificates yet."
        action={
          <Button
            variant="primary"
            size="sm"
            className="gap-1.5"
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
        count={otherDocuments.length}
        empty="No documents yet."
        action={
          <label className={fileButton("primary")}>
            <Upload aria-hidden="true" size={15} /> Upload
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
