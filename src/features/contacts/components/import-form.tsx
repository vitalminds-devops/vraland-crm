"use client";

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { notify, notifyLoading } from "@/components/ui/toast";
import { importContactsCsv, type ContactImportSummary } from "../actions/contact.actions";

const statusLabels: Record<string, string> = {
  created: "Created",
  skipped: "Not imported (duplicate)",
  flagged: "Flagged (possible duplicate)",
};

export function ImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<ContactImportSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.size || file.size > 2_000_000) {
      event.target.value = "";
      notify("CSV file not accepted", "error", {
        description: "Choose a CSV file with content, smaller than 2 MB.",
      });
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    // Clear the input so selecting the same file again re-triggers change.
    event.target.value = "";

    startTransition(async () => {
      const toastId = notifyLoading(`Importing ${file.name}…`);
      try {
        const result = await importContactsCsv(formData);
        if (result.success) {
          setSummary(result.data.summary);
          setDialogOpen(true);
          notify(result.data.message, "success", toastId);
          router.refresh();
        } else {
          notify(result.error.message, "error", toastId);
        }
      } catch {
        notify("Could not confirm import", "error", {
          id: toastId,
          description:
            "Check the contact list before importing again. Some rows may already have been saved.",
        });
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => setPickerOpen(true)}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Upload className="mr-2 size-4" />
        )}
        {pending ? "Importing…" : "Import CSV"}
      </Button>

      <input
        ref={inputRef}
        name="file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        id="csv-file-input"
        disabled={pending}
        onChange={onFile}
      />

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup className="w-full max-w-md rounded-lg border bg-card p-5 text-left shadow-xl">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="text-lg font-semibold">Import contacts</DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    Upload a CSV file, max 2 MB or 1,000 rows.
                  </DialogDescription>
                </div>
                <DialogClose
                  aria-label="Close import"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                >
                  <X aria-hidden="true" size={16} />
                </DialogClose>
              </header>

              <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground/80">
                Rows with an email or mobile number that is already used are not imported.
              </p>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogClose className={buttonVariants({ variant: "secondary" })}>
                  Cancel
                </DialogClose>
                <Button
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    inputRef.current?.click();
                  }}
                >
                  <Upload className="mr-2 size-4" />
                  Choose CSV file
                </Button>
              </div>
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>

      {summary && (
        <ImportSummaryDialog summary={summary} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </>
  );
}

function ImportSummaryDialog({
  summary,
  open,
  onOpenChange,
}: {
  summary: ContactImportSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const problemRows = summary.rows.filter(
    (row) => row.status === "skipped" || row.status === "flagged",
  );
  const hasProblems = problemRows.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <DialogPopup className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg border bg-card p-5 text-left shadow-xl">
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                {hasProblems ? (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                )}
                <div>
                  <DialogTitle className="text-lg font-semibold">Import finished</DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    {summary.total} row{summary.total === 1 ? "" : "s"} processed
                    {hasProblems
                      ? ` · ${problemRows.length} need${
                          problemRows.length === 1 ? "s" : ""
                        } attention`
                      : ""}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose
                aria-label="Close import summary"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
              >
                <X aria-hidden="true" size={16} />
              </DialogClose>
            </header>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-4">
              <SummaryCount label="Created" value={summary.created} />
              <SummaryCount label="Duplicates" value={summary.skipped} />
              <SummaryCount label="Flagged" value={summary.flagged} />
              <SummaryCount label="Invalid" value={summary.invalid} />
            </dl>

            {problemRows.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rows needing attention
                </h3>
                <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto text-xs text-muted-foreground">
                  {problemRows.map((row) => (
                    <li
                      key={`${row.row}-${row.status}`}
                      className="flex gap-2 rounded-md border border-border/60 bg-background p-2"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                      <span>
                        <span className="font-medium text-foreground">Row {row.row}:</span>{" "}
                        {statusLabels[row.status] ?? row.status} — {row.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
