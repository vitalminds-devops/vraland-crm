"use client";

import { Check, FileText, Plus, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

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
import { notify } from "@/components/ui/toast";
import {
  bankOptions,
  financingPreferenceLabels,
  extraDocumentTypes,
  financingPreferences,
  requiredDocumentLabel,
} from "@/features/contacts/lib/contact-options";
import { PropertyFloorUnitSelector } from "@/features/properties";
import { cn } from "@/lib/utils/cn";
import { groupDigits } from "@/lib/utils/group-digits";
import { fieldErrorsOf } from "@/lib/types/action-result.client";

import {
  getOpportunityDraft,
  getOpportunityEstimate,
  openOpportunity,
  type OpportunityDraft,
} from "../actions/opportunity.actions";
import type { DealActionResult } from "../actions/deal.actions";

import { OpportunityParkingSelector } from "./opportunity-parking-selector";

/** Matches MAX_EXTRA_FILES on the server. */
const MAX_EXTRAS = 3;

const field =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** One document as a single row: name and status on the left, an upload button on the right. */
function FileRow({
  label,
  name,
  onFile,
  multiple,
  onPick,
}: {
  label: string;
  name: string;
  onFile?: boolean;
  multiple?: boolean;
  onPick?: (files: File[]) => void;
}) {
  const [picked, setPicked] = useState("");
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
            setPicked(files.map((file) => file.name).join(", "));
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

/**
 * Collects what a lead needs to become an opportunity, then moves it. Used by the pipeline board
 * and the opportunity page whenever a deal goes from Leads to Opportunity.
 * Step 1 takes the documents, step 2 the deal details.
 */
export function OpportunityDialog({
  dealId,
  stageId,
  dealTitle,
  onClose,
  onDone,
}: {
  dealId: string;
  stageId: string;
  dealTitle: string;
  onClose: () => void;
  onDone: (result: DealActionResult) => void;
}) {
  const [draft, setDraft] = useState<OpportunityDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const [moveError, setMoveError] = useState<{ title: string; description: string } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [hasAppointment, setHasAppointment] = useState(false);
  const [extras, setExtras] = useState<{ file: File; type: string }[]>([]);
  const [nextType, setNextType] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [developmentId, setDevelopmentId] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [parkingSelection, setParkingSelection] = useState<{
    buildingId: string | null;
    ids: string[];
  }>({ buildingId: null, ids: [] });
  const parkingSlotIds = useMemo(
    () => (parkingSelection.buildingId === buildingId ? parkingSelection.ids : []),
    [parkingSelection, buildingId],
  );
  const parkingSlots = parkingSlotIds.length;
  const changeBuilding = useCallback((id: string | null) => {
    setBuildingId(id);
    setParkingSelection((current) =>
      current.buildingId === id ? current : { buildingId: id, ids: [] },
    );
  }, []);
  const [estimate, setEstimate] = useState<{
    key: string;
    result: Awaited<ReturnType<typeof getOpportunityEstimate>>;
  } | null>(null);
  const [financing, setFinancing] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getOpportunityDraft(dealId)
      .then((loaded) => {
        if (!live) return;
        if (!loaded) return setFailed(true);
        setDraft(loaded);
        setTinNumber(loaded.tinNumber);
        setDevelopmentId(loaded.developmentId);
        setUnitIds(loaded.unitIds);
        setParkingSelection({ buildingId: loaded.buildingId, ids: loaded.parkingSlotIds ?? [] });
        setFinancing(loaded.financingPreference);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [dealId]);

  const selectionKey = JSON.stringify([developmentId, buildingId, unitIds, parkingSlotIds]);
  const currentEstimate = estimate?.key === selectionKey ? estimate.result : null;
  useEffect(() => {
    if (step !== 2 || !buildingId || !unitIds.length) return;
    let live = true;
    getOpportunityEstimate({ developmentId, buildingId, unitIds, parkingSlotIds }, dealId)
      .then((result) => {
        if (live) setEstimate({ key: selectionKey, result });
      })
      .catch(() => {
        if (live)
          setEstimate({
            key: selectionKey,
            result: {
              success: false,
              message: "The expected amount could not be loaded. Try selecting the unit again.",
            },
          });
      });
    return () => {
      live = false;
    };
  }, [step, developmentId, buildingId, unitIds, parkingSlotIds, selectionKey, dealId]);

  const documentsReady =
    Boolean(draft) &&
    Boolean(tinNumber.trim()) &&
    (draft!.onFile.validId || Boolean(idFile)) &&
    (draft!.onFile.appointmentForm || hasAppointment) &&
    extras.every((extra) => extra.type);

  function showMoveError(title: string, description: string) {
    setMoveError({ title, description });
    notify(title, "error", { description });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMoveError(null);
    if (step === 1) {
      if (documentsReady) setStep(2);
      return;
    }
    const form = new FormData(event.currentTarget);
    form.set("dealId", dealId);
    form.set("stageId", stageId);
    form.set("buildingId", buildingId ?? "");
    for (const id of parkingSlotIds) form.append("parkingSlotIds", id);
    for (const id of unitIds) form.append("unitIds", id);
    for (const extra of extras) {
      form.append("additional", extra.file);
      form.append("additionalType", extra.type);
    }
    for (const entry of form.values()) {
      if (entry instanceof File && entry.size > 15 * 1024 * 1024) {
        showMoveError(
          "Document is too large",
          `${entry.name} exceeds the 15 MB limit. In Documents, replace it with a file that is 15 MB or smaller, then try again.`,
        );
        setStep(1);
        return;
      }
    }
    startTransition(async () => {
      let result: DealActionResult;
      try {
        result = await openOpportunity(form);
      } catch {
        showMoveError(
          "Could not confirm the move",
          "We did not receive a confirmation. Refresh the pipeline to check whether the lead is in Opportunity before trying again.",
        );
        return;
      }
      if (!result.success) {
        const fieldErrors = fieldErrorsOf(result);
        const messages = [...new Set(Object.values(fieldErrors).flat())];
        showMoveError(
          "Lead was not moved to Opportunity",
          messages.length
            ? messages.join("\n")
            : result.error.message ||
                "Please try again. If it still fails, contact your administrator.",
        );
        if (fieldErrors.tinNumber || fieldErrors.prcLicenseNumber) setStep(1);
        return;
      }
      onDone(result);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold">Move to Opportunity</DialogTitle>
                <p className="mt-1 truncate text-[13px] text-muted-foreground">{dealTitle}</p>
              </div>
              <DialogClose
                aria-label="Close"
                className="-mt-1 -mr-1 grid size-8 shrink-0 place-content-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </DialogClose>
            </header>

            {failed ? (
              <p role="alert" className="mt-5 text-sm text-destructive">
                Lead details could not be loaded. Close this dialog, refresh the pipeline, and try
                again.
              </p>
            ) : !draft ? (
              <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={submit} className="mt-4 grid gap-4">
                {moveError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                  >
                    <p className="font-medium text-destructive">{moveError.title}</p>
                    <p className="mt-1 whitespace-pre-line break-words text-foreground">
                      {moveError.description}
                    </p>
                  </div>
                )}
                <ol className="flex items-center gap-2 text-xs font-medium">
                  {(["Documents", "Details"] as const).map((label, index) => {
                    const current = step === index + 1;
                    return (
                      <li key={label} className="flex items-center gap-2">
                        {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
                        <span
                          aria-current={current ? "step" : undefined}
                          className={cn(
                            "grid size-5 place-content-center rounded-full",
                            current
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className={current ? "" : "text-muted-foreground"}>{label}</span>
                      </li>
                    );
                  })}
                </ol>

                {/* Step 1 stays mounted while hidden so its files are still submitted. */}
                <fieldset className={cn("grid gap-3", step !== 1 && "hidden")}>
                  <legend className="sr-only">Documents</legend>
                  <Field label="TIN number" required>
                    <Input
                      name="tinNumber"
                      inputMode="numeric"
                      value={groupDigits(tinNumber)}
                      onChange={(event) => setTinNumber(groupDigits(event.target.value))}
                      required={step === 1}
                      maxLength={50}
                      placeholder="Enter the client's TIN number"
                      className={field}
                    />
                  </Field>
                  <Field label="PRC license number">
                    <Input
                      name="prcLicenseNumber"
                      defaultValue={draft.prcLicenseNumber}
                      maxLength={50}
                      placeholder="If applicable"
                      className={field}
                    />
                  </Field>
                  <div className="divide-y divide-border/60 rounded-lg border border-border/60 px-3">
                    <div>
                      <FileRow
                        label={requiredDocumentLabel("valid_id")}
                        name="validId"
                        onFile={draft.onFile.validId}
                        onPick={(files) => setIdFile(files[0] ?? null)}
                      />
                      {(idFile || draft.onFile.validIdFile) && (
                        <div className="pb-3">
                          <IdPreview file={idFile} onFile={draft.onFile.validIdFile} />
                        </div>
                      )}
                    </div>
                    <FileRow
                      label={requiredDocumentLabel("client_appointment_form")}
                      name="appointmentForm"
                      onFile={draft.onFile.appointmentForm}
                      onPick={(files) => setHasAppointment(files.length > 0)}
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
                                  setExtras((current) => current.filter((_, i) => i !== index))
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
                            onChange={(event) => setNextType(event.target.value)}
                            className={cn(field, "h-8 py-1 pr-8 text-xs")}
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
                              nextType
                                ? "cursor-pointer hover:bg-muted"
                                : "pointer-events-none opacity-50",
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
                                setExtras((current) =>
                                  [...current, { file, type: nextType }].slice(0, MAX_EXTRAS),
                                );
                                setNextType("");
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </fieldset>

                {step === 2 && (
                  <div className="grid gap-4">
                    <div className="grid gap-3">
                      <Field label="Development" required>
                        <NativeSelect
                          required
                          name="developmentId"
                          value={developmentId}
                          onChange={(event) => {
                            setDevelopmentId(event.target.value);
                            setUnitIds([]);
                            setBuildingId(null);
                            setParkingSelection({ buildingId: null, ids: [] });
                          }}
                          className={cn(field, "pr-9")}
                        >
                          <NativeSelectOption value="">Select development</NativeSelectOption>
                          {draft.developments.map((development) => (
                            <NativeSelectOption key={development.id} value={development.id}>
                              {development.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      {developmentId && (
                        <PropertyFloorUnitSelector
                          key={developmentId}
                          developmentId={developmentId}
                          initialUnitIds={developmentId === draft.developmentId ? unitIds : []}
                          initialBuildingId={
                            buildingId ??
                            (developmentId === draft.developmentId ? draft.buildingId : null)
                          }
                          unitIds={unitIds}
                          onBuildingChange={changeBuilding}
                          onUnitsChange={setUnitIds}
                          selectClassName={cn(field, "pr-9")}
                          disabled={pending}
                        />
                      )}
                    </div>

                    <section
                      className="space-y-2 rounded-xl border border-border/60 bg-card p-3"
                      aria-label="Parking Slots (Optional)"
                    >
                      <h3 className="text-[13px] font-medium">Parking Slots (Optional)</h3>
                      {buildingId ? (
                        <OpportunityParkingSelector
                          key={buildingId}
                          developmentId={developmentId}
                          buildingId={buildingId}
                          selectedIds={parkingSlotIds}
                          heldIds={draft.parkingSlotIds ?? []}
                          onChange={(ids) => setParkingSelection({ buildingId, ids })}
                          disabled={pending}
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Select a building to choose parking slots.
                        </p>
                      )}
                    </section>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Financing" required>
                        <NativeSelect
                          required
                          name="financingPreference"
                          value={financing}
                          onChange={(event) => setFinancing(event.target.value)}
                          className={cn(field, "pr-9")}
                        >
                          <NativeSelectOption value="">Select financing</NativeSelectOption>
                          {financingPreferences.map((value) => (
                            <NativeSelectOption key={value} value={value}>
                              {financingPreferenceLabels[value]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      {financing === "bank_financing" && (
                        <Field label="Bank" required>
                          <Input
                            required
                            name="bankName"
                            list="opportunity-banks"
                            defaultValue={draft.bankName}
                            placeholder="e.g. BDO Unibank"
                            className={field}
                          />
                          <datalist id="opportunity-banks">
                            {bankOptions.map((bank) => (
                              <option key={bank} value={bank} />
                            ))}
                          </datalist>
                        </Field>
                      )}
                      {financing === "other" && (
                        <Field label="Other financing" required>
                          <Input
                            required
                            name="financingPreferenceOther"
                            defaultValue={draft.financingPreferenceOther}
                            className={field}
                          />
                        </Field>
                      )}
                    </div>
                    <div
                      className="rounded-lg border border-primary/20 bg-primary/5 p-4"
                      aria-live="polite"
                    >
                      <h3 className="text-sm font-semibold">Expected amount</h3>
                      {currentEstimate?.success ? (
                        <dl className="mt-3 grid gap-2 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt>
                              {unitIds.length} {unitIds.length === 1 ? "unit" : "units"} ×{" "}
                              {formatPrice(currentEstimate.unitPrice, currentEstimate.currency)}
                            </dt>
                            <dd className="tabular-nums">
                              {formatPrice(currentEstimate.units, currentEstimate.currency)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>
                              {parkingSlots} parking {parkingSlots === 1 ? "slot" : "slots"}
                              {parkingSlots > 0 && currentEstimate.parkingPrice
                                ? ` × ${formatPrice(currentEstimate.parkingPrice, currentEstimate.currency)}`
                                : ""}
                            </dt>
                            <dd className="tabular-nums">
                              {formatPrice(currentEstimate.parking, currentEstimate.currency)}
                            </dd>
                          </div>
                          <div className="mt-1 flex justify-between gap-3 border-t border-primary/20 pt-3 text-base font-semibold">
                            <dt>Total</dt>
                            <dd className="text-primary tabular-nums">
                              {formatPrice(currentEstimate.total, currentEstimate.currency)}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p
                          className={cn(
                            "mt-2 text-sm",
                            currentEstimate ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {currentEstimate && !currentEstimate.success
                            ? currentEstimate.message
                            : buildingId && unitIds.length
                              ? "Calculating…"
                              : "Select a building and unit to see the total."}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        Based on unit and parking prices. Moving to Opportunity reserves your
                        selection.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  {step === 1 ? (
                    <>
                      <DialogClose className={buttonVariants({ variant: "ghost" })}>
                        Cancel
                      </DialogClose>
                      <Button type="submit" disabled={!documentsReady}>
                        Next
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep(1)}
                        disabled={pending}
                      >
                        Back
                      </Button>
                      <Button type="submit" disabled={pending || !currentEstimate?.success}>
                        {pending ? "Saving…" : "Move to Opportunity"}
                      </Button>
                    </>
                  )}
                </div>
              </form>
            )}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function formatPrice(value: string, currency: string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(Number(value));
}
