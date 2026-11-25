"use client";

import { unitsReservationFee } from "@/features/billing/lib/quoted-terms";
import { Check, FileText, Loader2, Plus, ScanLine, Upload, X } from "lucide-react";
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
import { MoneyInput } from "@/components/ui/money-input";
import {
  opportunityAddressSchema,
  type OpportunityAddress,
} from "@/features/contacts/schemas/opportunity-contact.schema";
import { COUNTRY_NAME } from "@/lib/location";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify, notifyLoading } from "@/components/ui/toast";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import {
  bankOptions,
  extraDocumentTypes,
  requiredDocumentLabel,
  budgetRanges,
  budgetRangeFor,
  budgetForRange,
  purchaseTypes,
  purchaseTypeLabels,
  employmentTypes,
} from "@/features/contacts/lib/contact-options";
import { PaymentMethodSelect } from "@/features/billing/components/payment-method-select";
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

import { Field, fieldClass } from "./opportunity-field";
import { OpportunityAddressStep } from "./opportunity-address-step";
import { OpportunityParkingSelector } from "./opportunity-parking-selector";
import type { IdAddressField } from "../lib/id-address";
import { applyIdAddress, clearIdAddressHint, noIdAddressHints } from "../lib/id-address-autofill";
import { readIdAddress } from "../lib/read-id-address";
import {
  loadOpportunityFormDraft,
  cacheOpportunityFormDraft,
  saveOpportunityFormDraft,
  removeOpportunityFormDraft,
  type OpportunityFormDraft,
} from "../lib/opportunity-form-draft";

/** Matches MAX_EXTRA_FILES on the server. */
const MAX_EXTRAS = 3;

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

/**
 * Collects what a lead needs to become an opportunity, then moves it. Used by the pipeline board
 * and the opportunity page whenever a deal goes from Leads to Opportunity.
 * Collects documents, address, then property interest before moving the lead.
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const completed = useRef(false);
  const latestDraft = useRef<OpportunityFormDraft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restoredFields, setRestoredFields] = useState<Record<string, string>>({});
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "unavailable">("saving");
  const [address, setAddress] = useState<OpportunityAddress>({
    currentProvince: null,
    currentCity: null,
    currentBarangay: null,
    currentAddressLine1: null,
    currentPostalCode: null,
    currentCountry: COUNTRY_NAME,
  });
  const [budget, setBudget] = useState("");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [appointmentFile, setAppointmentFile] = useState<File | null>(null);
  const idScan = useRef<AbortController | null>(null);
  const addressBeforeUpload = useRef<OpportunityAddress | undefined>(undefined);
  /** The scan reads the latest address, not the one it started with. */
  const latestAddress = useRef(address);
  useEffect(() => {
    latestAddress.current = address;
  }, [address]);
  /** Fields typed or picked by hand; an ID never overwrites them. */
  const editedFields = useRef(new Set<IdAddressField>());
  const [idHints, setIdHints] = useState(noIdAddressHints);
  const editAddress = (next: OpportunityAddress, field: IdAddressField) => {
    editedFields.current.add(field);
    setAddress(next);
    setIdHints((current) => clearIdAddressHint(current, field));
  };
  const [scanStatus, setScanStatus] = useState<{
    state: "idle" | "reading" | "found" | "not-found" | "error";
    progress?: number;
  }>({ state: "idle" });
  const onFileId = draft?.onFile.validIdFile?.id;
  /** An uploaded or camera-captured ID replaces the last one and is read again. */
  const pickId = (file: File | null) => {
    idScan.current?.abort();
    // A new ID replaces the address; only edits made while it is read are kept (via the snapshot).
    if (file) editedFields.current.clear();
    addressBeforeUpload.current = file ? address : undefined;
    setIdHints(noIdAddressHints);
    setIdFile(file);
    if (!file) setScanStatus({ state: "idle" });
  };
  const scanId = useCallback(async () => {
    idScan.current?.abort();
    const controller = new AbortController();
    idScan.current = controller;
    const beforeUpload = addressBeforeUpload.current;
    setScanStatus({ state: "reading", progress: 0 });
    try {
      let source = idFile;
      if (!source && onFileId) {
        const response = await fetch(`/api/documents/${onFileId}/download`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("ID unavailable");
        const blob = await response.blob();
        source = new File(
          [blob],
          blob.type === "application/pdf" ? "valid-id.pdf" : "valid-id.jpg",
          { type: blob.type },
        );
      }
      if (!source) throw new Error("No ID selected");
      const found = await readIdAddress(source, controller.signal, (progress) =>
        setScanStatus({ state: "reading", progress }),
      );
      if (controller.signal.aborted || completed.current) return;
      if (found) {
        const { address: next, ...hints } = applyIdAddress(latestAddress.current, found, {
          beforeUpload,
          edited: editedFields.current,
        });
        latestAddress.current = next;
        setAddress(next);
        setIdHints(hints);
        setScanStatus({ state: "found" });
      } else setScanStatus({ state: "not-found" });
    } catch {
      if (!controller.signal.aborted) setScanStatus({ state: "error" });
    }
  }, [idFile, onFileId]);
  useEffect(() => {
    const timer = idFile || onFileId ? setTimeout(() => void scanId(), 0) : undefined;
    return () => {
      clearTimeout(timer);
      idScan.current?.abort();
    };
  }, [idFile, onFileId, scanId]);
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
    const url = new URL(window.location.href);
    url.searchParams.set("opportunityDraft", dealId);
    window.history.replaceState(window.history.state, "", url);
    return () => {
      const current = new URL(window.location.href);
      if (current.searchParams.get("opportunityDraft") === dealId) {
        current.searchParams.delete("opportunityDraft");
        window.history.replaceState(window.history.state, "", current);
      }
    };
  }, [dealId]);

  useEffect(() => {
    let live = true;
    getOpportunityDraft(dealId)
      .then(async (loaded) => {
        if (!live) return;
        if (!loaded) return setFailed(true);
        let saved: OpportunityFormDraft | null = null;
        try {
          saved = await loadOpportunityFormDraft(loaded.draftKey);
        } catch {
          setDraftStatus("unavailable");
        }
        if (!live) return;
        setDraft(loaded);
        setTinNumber(saved?.tinNumber ?? loaded.tinNumber);
        setDevelopmentId(saved?.developmentId ?? loaded.developmentId);
        setBuildingId(saved?.buildingId ?? loaded.buildingId);
        setUnitIds(saved?.unitIds ?? loaded.unitIds);
        setParkingSelection(
          saved?.parkingSelection ?? {
            buildingId: loaded.buildingId,
            ids: loaded.parkingSlotIds ?? [],
          },
        );
        setFinancing(saved?.financing ?? loaded.financingPreference);
        setAddress(
          saved?.address ?? {
            ...loaded.address,
            currentCountry: loaded.address.currentCountry || COUNTRY_NAME,
          },
        );
        setBudget(
          saved?.budget ??
            budgetRangeFor(loaded.interest.budgetMin, loaded.interest.budgetMax) ??
            "",
        );
        if (saved) {
          setRestoredFields(saved.fields);
          setIdFile(saved.idFile);
          setAppointmentFile(saved.appointmentFile);
          setExtras(saved.extras);
          setNextType(saved.nextType);
          setStep(saved.step);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [dealId]);

  const formDraft = useMemo(
    () => ({
      step,
      address,
      budget,
      tinNumber,
      developmentId,
      buildingId,
      unitIds,
      parkingSelection,
      financing,
      nextType,
      idFile,
      appointmentFile,
      extras,
    }),
    [
      step,
      address,
      budget,
      tinNumber,
      developmentId,
      buildingId,
      unitIds,
      parkingSelection,
      financing,
      nextType,
      idFile,
      appointmentFile,
      extras,
    ],
  );
  const queueDraftSave = useCallback(() => {
    if (!draft || !formRef.current || completed.current || pending) return;
    const fields = Object.fromEntries(
      [...new FormData(formRef.current)].filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    const snapshot = {
      ...formDraft,
      fields,
      address: {
        ...formDraft.address,
        currentAddressLine1: fields.currentAddressLine1 ?? formDraft.address.currentAddressLine1,
      },
      tinNumber: fields.tinNumber ?? formDraft.tinNumber,
    };
    latestDraft.current = snapshot;
    try {
      cacheOpportunityFormDraft(draft.draftKey, snapshot);
    } catch {
      // The IndexedDB write below can still recover the draft if session storage is blocked.
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (completed.current) return;
      setDraftStatus("saving");
      void saveOpportunityFormDraft(draft.draftKey, snapshot)
        .then(() => {
          if (latestDraft.current === snapshot) setDraftStatus("saved");
        })
        .catch(() => setDraftStatus("unavailable"));
    }, 250);
  }, [draft, formDraft, pending]);
  useEffect(() => {
    queueDraftSave();
  }, [queueDraftSave]);
  useEffect(() => {
    if (draft && latestDraft.current && !completed.current)
      void saveOpportunityFormDraft(draft.draftKey, latestDraft.current).catch(() =>
        setDraftStatus("unavailable"),
      );
  }, [draft, idFile, appointmentFile, extras]);
  useEffect(() => {
    if (!draft) return;
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (latestDraft.current && !completed.current)
        void saveOpportunityFormDraft(draft.draftKey, latestDraft.current).catch(() => {});
    };
    const onVisibility = () => {
      if (document.hidden) flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [draft]);

  const selectionKey = JSON.stringify([developmentId, buildingId, unitIds, parkingSlotIds]);
  const currentEstimate = estimate?.key === selectionKey ? estimate.result : null;
  useEffect(() => {
    if (step !== 4 || !buildingId || !unitIds.length) return;
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
    (draft!.onFile.appointmentForm || Boolean(appointmentFile)) &&
    extras.every((extra) => extra.type);

  function showMoveError(title: string, description: string, toastId?: string | number) {
    notify(title, "error", { id: toastId, description });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1) {
      if (documentsReady) setStep(2);
      return;
    }
    if (step === 2) {
      const checked = opportunityAddressSchema.safeParse(address);
      if (!checked.success) {
        showMoveError("Complete the address", checked.error.issues[0].message);
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (budget) setStep(4);
      return;
    }
    if (!buildingId || !unitIds.length || !currentEstimate?.success) {
      showMoveError(
        "Select a unit",
        "Choose an available unit before moving this lead to Opportunity.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    for (const [key, value] of Object.entries(address)) form.set(key, value ?? "");
    const range = budgetForRange(budget);
    form.set("budgetMin", range.budgetMin === null ? "" : String(range.budgetMin));
    form.set("budgetMax", range.budgetMax === null ? "" : String(range.budgetMax));
    // Send the retained files, not empty file inputs from the hidden Documents step.
    form.delete("validId");
    form.delete("appointmentForm");
    if (idFile) form.set("validId", idFile);
    if (appointmentFile) form.set("appointmentForm", appointmentFile);
    form.set("dealId", dealId);
    form.set("stageId", stageId);
    form.set("buildingId", buildingId ?? "");
    for (const id of parkingSlotIds) form.append("parkingSlotIds", id);
    for (const id of unitIds) form.append("unitIds", id);
    for (const extra of extras) {
      form.append("additional", extra.file);
      form.append("additionalType", extra.type);
    }
    startTransition(async () => {
      const toastId = notifyLoading(
        "Saving opportunity and documents…",
        `save-opportunity-${dealId}`,
      );
      let result: DealActionResult;
      try {
        for (const entry of form.values()) {
          if (!(entry instanceof File) || !entry.name) continue;
          const error = await documentFileError(entry, requirementFileTypes);
          if (error) {
            showMoveError("Document was not accepted", error, toastId);
            setStep(1);
            return;
          }
        }
        result = await openOpportunity(form);
      } catch {
        showMoveError(
          "Couldn't confirm the move",
          "We did not receive a confirmation. Refresh the pipeline to check whether the lead is in Opportunity before trying again.",
          toastId,
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
          toastId,
        );
        if (fieldErrors.tinNumber || fieldErrors.prcLicenseNumber) setStep(1);
        else if (Object.keys(fieldErrors).some((key) => key in opportunityAddressSchema.shape))
          setStep(2);
        else if (
          fieldErrors.budgetMin ||
          fieldErrors.budgetMax ||
          fieldErrors.annualIncome ||
          fieldErrors.purchaseType ||
          fieldErrors.employmentType
        )
          setStep(3);
        return;
      }
      notify(
        result.data.approvalRequested ? "Move sent for approval" : "Lead moved to Opportunity",
        "success",
        {
          id: toastId,
          description: result.data.message,
        },
      );
      completed.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await removeOpportunityFormDraft(draft!.draftKey).catch(() => {});
      onDone(result);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup
            aria-describedby={undefined}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border/60 bg-card p-5 shadow-2xl"
          >
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
              <form
                ref={formRef}
                onSubmit={submit}
                onChangeCapture={queueDraftSave}
                className="mt-4 grid gap-4"
              >
                <p role="status" className="text-xs text-muted-foreground">
                  {draftStatus === "saved"
                    ? "Draft saved on this browser"
                    : draftStatus === "unavailable"
                      ? "Draft could not be saved. Keep this tab open to preserve your entries."
                      : "Saving draft…"}
                </p>
                <ol className="grid grid-cols-2 gap-2 text-xs font-medium sm:flex sm:items-center">
                  {(["Documents", "Address", "Property interest", "Unit selection"] as const).map(
                    (label, index) => {
                      const current = step === index + 1;
                      return (
                        <li key={label} className="flex items-start gap-2 sm:items-center">
                          {index > 0 && (
                            <span
                              aria-hidden="true"
                              className="hidden h-px w-6 bg-border sm:block"
                            />
                          )}
                          <span
                            aria-current={current ? "step" : undefined}
                            className={cn(
                              "grid size-5 shrink-0 place-content-center rounded-full",
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
                    },
                  )}
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
                        onPick={(files) => pickId(files[0] ?? null)}
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
                      onPick={(files) => setAppointmentFile(files[0] ?? null)}
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

                <fieldset className={cn("grid gap-4", step !== 2 && "hidden")}>
                  <legend className="sr-only">Address</legend>
                  <OpportunityAddressStep
                    address={address}
                    required={step === 2}
                    hints={idHints}
                    onChange={editAddress}
                  />
                </fieldset>

                <div className={cn("grid gap-4", step !== 3 && "hidden")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Budget range" required>
                      <NativeSelect
                        required={step === 3}
                        value={budget}
                        onChange={(event) => setBudget(event.target.value)}
                      >
                        <NativeSelectOption value="">Select budget</NativeSelectOption>
                        {budgetRanges.map((range) => (
                          <NativeSelectOption key={range.value} value={range.value}>
                            {range.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Property type">
                      <NativeSelect
                        name="purchaseType"
                        defaultValue={
                          restoredFields.purchaseType ?? draft.interest.purchaseType ?? ""
                        }
                      >
                        <NativeSelectOption value="">Not specified</NativeSelectOption>
                        {purchaseTypes.map((type) => (
                          <NativeSelectOption key={type} value={type}>
                            {purchaseTypeLabels[type]}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Employment">
                      <NativeSelect
                        name="employmentType"
                        defaultValue={
                          restoredFields.employmentType ?? draft.interest.employmentType ?? ""
                        }
                      >
                        <NativeSelectOption value="">Not specified</NativeSelectOption>
                        {employmentTypes.map((type) => (
                          <NativeSelectOption key={type} value={type}>
                            {type}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Annual income">
                      <MoneyInput
                        name="annualIncome"
                        defaultValue={restoredFields.annualIncome ?? draft.interest.annualIncome}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                </div>
                <div className={cn("grid gap-4", step !== 4 && "hidden")}>
                  <div className="grid gap-3">
                    <Field label="Development" required>
                      <NativeSelect
                        required={step === 4}
                        name="developmentId"
                        value={developmentId}
                        onChange={(event) => {
                          setDevelopmentId(event.target.value);
                          setUnitIds([]);
                          setBuildingId(null);
                          setParkingSelection({ buildingId: null, ids: [] });
                        }}
                        className={cn(fieldClass, "pr-9")}
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
                        selectClassName={cn(fieldClass, "pr-9")}
                        disabled={pending}
                        floorExtras={(floorId) =>
                          buildingId && (
                            <OpportunityParkingSelector
                              key={buildingId}
                              developmentId={developmentId}
                              buildingId={buildingId}
                              floorId={floorId}
                              selectedIds={parkingSlotIds}
                              dealId={dealId}
                              onChange={(ids) => setParkingSelection({ buildingId, ids })}
                              disabled={pending}
                            />
                          )
                        }
                      />
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Financing" required>
                      <PaymentMethodSelect
                        required={step === 4}
                        name="financingPreference"
                        value={financing}
                        onValueChange={setFinancing}
                        disabled={pending}
                      />
                    </Field>
                    {financing === "bank_financing" && (
                      <Field label="Bank" required>
                        <Input
                          required={step === 4}
                          name="bankName"
                          list="opportunity-banks"
                          defaultValue={restoredFields.bankName ?? draft.bankName}
                          placeholder="e.g. BDO Unibank"
                          className={fieldClass}
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
                          required={step === 4}
                          name="financingPreferenceOther"
                          defaultValue={
                            restoredFields.financingPreferenceOther ??
                            draft.financingPreferenceOther
                          }
                          className={fieldClass}
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
                        {/* A line per unit and slot, so differing prices are all visible. */}
                        {[
                          ...currentEstimate.selectedUnits.map((unit) => ({
                            label: `Unit ${unit.code}`,
                            price: unit.price,
                          })),
                          ...currentEstimate.selectedSlots.map((slot) => ({
                            label: `Parking ${slot.code}`,
                            price: slot.price,
                          })),
                        ].map((line) => (
                          <div key={line.label} className="flex justify-between gap-3">
                            <dt>{line.label}</dt>
                            <dd className="tabular-nums">
                              {formatPrice(line.price ?? "0", currentEstimate.currency)}
                            </dd>
                          </div>
                        ))}
                        <div className="mt-1 flex justify-between gap-3 border-t border-primary/20 pt-3 text-base font-semibold">
                          <dt>Total</dt>
                          <dd className="text-primary tabular-nums">
                            {formatPrice(currentEstimate.total, currentEstimate.currency)}
                          </dd>
                        </div>
                        {/* What the opportunity will be quoted, saved with it. */}
                        {(
                          [
                            ...(currentEstimate.parkingReservationFee
                              ? ([
                                  [
                                    "Unit reservation fee",
                                    unitsReservationFee(
                                      currentEstimate.reservationFee,
                                      currentEstimate.parkingReservationFee,
                                    ),
                                  ],
                                  [
                                    "Parking reservation fee",
                                    currentEstimate.parkingReservationFee,
                                  ],
                                ] as const)
                              : ([["Reservation fee", currentEstimate.reservationFee]] as const)),
                            ["Monthly amortization", currentEstimate.monthlyAmortization],
                          ] as const
                        ).map(([label, amount]) => (
                          <div
                            key={label}
                            className="flex justify-between gap-3 text-muted-foreground"
                          >
                            <dt>{label}</dt>
                            <dd className="tabular-nums">
                              {amount ? formatPrice(amount, currentEstimate.currency) : "—"}
                            </dd>
                          </div>
                        ))}
                        {currentEstimate.missingFee && (
                          <p role="note" className="text-xs text-amber-700 dark:text-amber-400">
                            {currentEstimate.missingFee}
                          </p>
                        )}
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
                            : "Select a property and unit to see the total."}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Based on unit and parking prices. Units and parking stay available until the
                      reservation fee is paid.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {step === 1 ? (
                    <>
                      <DialogClose className={buttonVariants({ variant: "ghost" })}>
                        Cancel
                      </DialogClose>
                      <Button
                        type="submit"
                        className="gap-2"
                        disabled={!documentsReady || scanStatus.state === "reading"}
                      >
                        {scanStatus.state === "reading" ? (
                          <>
                            <Loader2
                              aria-hidden="true"
                              className="size-4 animate-spin motion-reduce:animate-none"
                            />
                            Reading ID…
                          </>
                        ) : (
                          "Next"
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                        disabled={pending}
                      >
                        Back
                      </Button>
                      {step < 4 ? (
                        <Button type="submit">Next</Button>
                      ) : (
                        <Button
                          type="submit"
                          disabled={pending || !unitIds.length || !currentEstimate?.success}
                        >
                          {pending ? "Saving…" : "Move to Opportunity"}
                        </Button>
                      )}
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
