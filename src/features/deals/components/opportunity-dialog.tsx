"use client";

import { Loader2, X } from "lucide-react";
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
import {
  opportunityAddressSchema,
  type OpportunityAddress,
} from "@/features/contacts/schemas/opportunity-contact.schema";
import { COUNTRY_NAME } from "@/lib/location";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify, notifyLoading } from "@/components/ui/toast";
import { documentFileError, requirementFileTypes } from "@/lib/storage/document-validation";
import { budgetRangeFor, budgetForRange } from "@/features/contacts/lib/contact-options";
import { PropertyFloorUnitSelector } from "@/features/properties";
import { cn } from "@/lib/utils/cn";
import { fieldErrorsOf } from "@/lib/types/action-result.client";

import {
  getOpportunityDraft,
  getOpportunityEstimate,
  openOpportunity,
} from "../actions/opportunity.actions";
import type { OpportunityDraft } from "../queries/opportunity.queries";
import type { DealActionResult } from "../actions/deal.actions";

import { Field, fieldClass } from "./opportunity-field";
import { OpportunityAddressStep } from "./opportunity-address-step";
import { OpportunityParkingSelector } from "./opportunity-parking-selector";
import {
  OpportunityDocumentsStep,
  type ExtraDocument,
  type IdScanStatus,
} from "./opportunity-documents-step";
import { OpportunityInterestStep } from "./opportunity-interest-step";
import { OpportunityFinancingFields } from "./opportunity-financing-fields";
import { OpportunityEstimatePanel, type OpportunityEstimate } from "./opportunity-estimate";
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
  // Picks restored from before (the opportunity, the contact's preferences or this browser's draft)
  // may have been taken since. Until the agent changes the selection, those are dropped on sight.
  const restoredPicks = useRef(true);
  const [droppedPicks, setDroppedPicks] = useState(0);
  const [idHints, setIdHints] = useState(noIdAddressHints);
  const editAddress = (next: OpportunityAddress, field: IdAddressField) => {
    editedFields.current.add(field);
    setAddress(next);
    setIdHints((current) => clearIdAddressHint(current, field));
  };
  const [scanStatus, setScanStatus] = useState<IdScanStatus>({ state: "idle" });
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
  const [extras, setExtras] = useState<ExtraDocument[]>([]);
  const [nextType, setNextType] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [developmentId, setDevelopmentId] = useState("");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [propertyId, setBuildingId] = useState<string | null>(null);
  const [parkingSelection, setParkingSelection] = useState<{
    propertyId: string | null;
    ids: string[];
  }>({ propertyId: null, ids: [] });
  const parkingSlotIds = useMemo(
    () => (parkingSelection.propertyId === propertyId ? parkingSelection.ids : []),
    [parkingSelection, propertyId],
  );
  const changeBuilding = useCallback((id: string | null) => {
    setBuildingId(id);
    setParkingSelection((current) =>
      current.propertyId === id ? current : { propertyId: id, ids: [] },
    );
  }, []);
  const [estimate, setEstimate] = useState<{
    key: string;
    result: OpportunityEstimate;
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
        setBuildingId(saved?.propertyId ?? loaded.propertyId);
        setUnitIds(saved?.unitIds ?? loaded.unitIds);
        setParkingSelection(
          saved?.parkingSelection ?? {
            propertyId: loaded.propertyId,
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
      propertyId,
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
      propertyId,
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

  const selectionKey = JSON.stringify([developmentId, propertyId, unitIds, parkingSlotIds]);
  const currentEstimate = estimate?.key === selectionKey ? estimate.result : null;
  useEffect(() => {
    if (step !== 4 || !propertyId || !unitIds.length) return;
    let live = true;
    getOpportunityEstimate({ developmentId, propertyId, unitIds, parkingSlotIds }, dealId)
      .then((result) => {
        if (!live) return;
        const staleUnits = "unavailableUnitIds" in result ? (result.unavailableUnitIds ?? []) : [];
        const staleSlots =
          "unavailableParkingSlotIds" in result ? (result.unavailableParkingSlotIds ?? []) : [];
        if (restoredPicks.current && staleUnits.length + staleSlots.length > 0) {
          setDroppedPicks((count) => count + staleUnits.length + staleSlots.length);
          if (staleUnits.length) setUnitIds(unitIds.filter((id) => !staleUnits.includes(id)));
          if (staleSlots.length)
            setParkingSelection({
              propertyId,
              ids: parkingSlotIds.filter((id) => !staleSlots.includes(id)),
            });
          return;
        }
        setEstimate({ key: selectionKey, result });
      })
      .catch(() => {
        if (live)
          setEstimate({
            key: selectionKey,
            result: {
              success: false,
              message: "Couldn't load the expected amount. Try selecting the unit again.",
            },
          });
      });
    return () => {
      live = false;
    };
  }, [step, developmentId, propertyId, unitIds, parkingSlotIds, selectionKey, dealId]);

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
    if (!propertyId || !unitIds.length || !currentEstimate?.success) {
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
    form.set("propertyId", propertyId ?? "");
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
                Couldn’t load the lead details. Close this dialog, refresh the pipeline, and try
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
                      ? "Couldn't save draft. Keep this tab open to preserve your entries."
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

                <OpportunityDocumentsStep
                  active={step === 1}
                  draft={draft}
                  restoredFields={restoredFields}
                  tinNumber={tinNumber}
                  onTinNumberChange={setTinNumber}
                  idFile={idFile}
                  onPickId={pickId}
                  scanStatus={scanStatus}
                  appointmentFile={appointmentFile}
                  onAppointmentFileChange={setAppointmentFile}
                  extras={extras}
                  onExtrasChange={setExtras}
                  nextType={nextType}
                  onNextTypeChange={setNextType}
                />

                <fieldset className={cn("grid gap-4", step !== 2 && "hidden")}>
                  <legend className="sr-only">Address</legend>
                  <OpportunityAddressStep
                    address={address}
                    required={step === 2}
                    hints={idHints}
                    onChange={editAddress}
                  />
                </fieldset>

                <OpportunityInterestStep
                  active={step === 3}
                  draft={draft}
                  restoredFields={restoredFields}
                  budget={budget}
                  onBudgetChange={setBudget}
                />
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
                          setParkingSelection({ propertyId: null, ids: [] });
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
                          propertyId ??
                          (developmentId === draft.developmentId ? draft.propertyId : null)
                        }
                        unitIds={unitIds}
                        onBuildingChange={changeBuilding}
                        onUnitsChange={(ids) => {
                          restoredPicks.current = false;
                          setUnitIds(ids);
                        }}
                        selectClassName={cn(fieldClass, "pr-9")}
                        disabled={pending}
                        floorExtras={(floorId) =>
                          propertyId && (
                            <OpportunityParkingSelector
                              key={propertyId}
                              developmentId={developmentId}
                              propertyId={propertyId}
                              floorId={floorId}
                              selectedIds={parkingSlotIds}
                              dealId={dealId}
                              onChange={(ids) => {
                                restoredPicks.current = false;
                                setParkingSelection({ propertyId, ids });
                              }}
                              disabled={pending}
                            />
                          )
                        }
                      />
                    )}
                  </div>

                  <OpportunityFinancingFields
                    active={step === 4}
                    draft={draft}
                    restoredFields={restoredFields}
                    financing={financing}
                    onFinancingChange={setFinancing}
                    disabled={pending}
                  />
                  <OpportunityEstimatePanel
                    estimate={currentEstimate}
                    propertyId={propertyId}
                    unitIds={unitIds}
                    onUnitIdsChange={setUnitIds}
                    droppedPicks={droppedPicks}
                  />
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
