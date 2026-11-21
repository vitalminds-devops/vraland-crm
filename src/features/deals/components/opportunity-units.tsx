"use client";

import { ArrowLeftRight, CopyPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { notify } from "@/components/ui/toast";
import { PropertyFloorUnitSelector } from "@/features/properties";
import {
  addOpportunityForContact,
  changeOpportunityUnits,
  getOpportunityDraft,
  getOpportunityEstimate,
  type OpportunityDraft,
} from "../actions/opportunity.actions";
import { OpportunityParkingSelector } from "./opportunity-parking-selector";

const field =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 pr-9 text-base outline-none sm:text-sm transition-all hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25";

const peso = (value: string, currency: string) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(Number(value));

/** Opens another opportunity for the same client, for a unit in another tower or development. */
export function AddOpportunityButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="gap-1.5"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Open another opportunity for this client? It starts in Leads."))
          return;
        startTransition(async () => {
          const result = await addOpportunityForContact(dealId);
          if (!result.success) return void notify(result.error.message, "error");
          notify("New opportunity opened.", "success");
          router.push(`/deals/${result.data.id}`);
        });
      }}
    >
      <CopyPlus aria-hidden="true" className="size-4" />
      {pending ? "Opening…" : "Add opportunity"}
    </Button>
  );
}

/** Moves an open opportunity to other units, tower or development. */
export function ChangeUnitsButton({ dealId }: { dealId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ArrowLeftRight aria-hidden="true" className="size-4" />
        Change unit
      </Button>
      {open && <ChangeUnitsDialog dealId={dealId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangeUnitsDialog({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<OpportunityDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const [developmentId, setDevelopmentId] = useState("");
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [parking, setParking] = useState<{ buildingId: string | null; ids: string[] }>({
    buildingId: null,
    ids: [],
  });
  const parkingSlotIds = parking.buildingId === buildingId ? parking.ids : [];
  const [estimate, setEstimate] = useState<{
    key: string;
    result: Awaited<ReturnType<typeof getOpportunityEstimate>>;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getOpportunityDraft(dealId)
      .then((loaded) => {
        if (!live) return;
        if (!loaded) return setFailed(true);
        setDraft(loaded);
        setDevelopmentId(loaded.developmentId);
        setBuildingId(loaded.buildingId);
        setUnitIds(loaded.unitIds);
        setParking({ buildingId: loaded.buildingId, ids: loaded.parkingSlotIds ?? [] });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [dealId]);

  const selection = { developmentId, buildingId: buildingId ?? "", unitIds, parkingSlotIds };
  const key = JSON.stringify(selection);
  const current = estimate?.key === key ? estimate.result : null;
  useEffect(() => {
    if (!buildingId || !unitIds.length) return;
    let live = true;
    getOpportunityEstimate(JSON.parse(key), dealId)
      .then((result) => live && setEstimate({ key, result }))
      .catch(
        () =>
          live &&
          setEstimate({
            key,
            result: { success: false, message: "The total could not be loaded." },
          }),
      );
    return () => {
      live = false;
    };
  }, [key, buildingId, unitIds.length, dealId]);

  const save = () =>
    startTransition(async () => {
      const result = await changeOpportunityUnits({ dealId, ...selection });
      if (!result.success) return void notify(result.error.message, "error");
      notify("Units changed.", "success");
      router.refresh();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-3">
              <DialogTitle className="text-base font-semibold">Change unit</DialogTitle>
              <DialogClose
                aria-label="Close"
                className="-mt-1 -mr-1 grid size-8 place-content-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </DialogClose>
            </header>
            {failed ? (
              <p className="mt-4 text-sm text-destructive">This opportunity could not be loaded.</p>
            ) : !draft ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5 text-sm font-medium">
                  Development
                  <NativeSelect
                    value={developmentId}
                    onChange={(event) => {
                      setDevelopmentId(event.target.value);
                      setBuildingId(null);
                      setUnitIds([]);
                    }}
                    className={field}
                    disabled={pending}
                  >
                    <NativeSelectOption value="">Select development</NativeSelectOption>
                    {draft.developments.map((development) => (
                      <NativeSelectOption key={development.id} value={development.id}>
                        {development.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                {developmentId && (
                  <PropertyFloorUnitSelector
                    key={developmentId}
                    developmentId={developmentId}
                    initialUnitIds={developmentId === draft.developmentId ? draft.unitIds : []}
                    initialBuildingId={
                      developmentId === draft.developmentId ? draft.buildingId : null
                    }
                    unitIds={unitIds}
                    onBuildingChange={setBuildingId}
                    onUnitsChange={setUnitIds}
                    selectClassName={field}
                    disabled={pending}
                  />
                )}
                {buildingId && (
                  <section className="space-y-2 rounded-xl border border-border/60 p-3">
                    <h3 className="text-[13px] font-medium">Parking (optional)</h3>
                    <OpportunityParkingSelector
                      key={buildingId}
                      developmentId={developmentId}
                      buildingId={buildingId}
                      selectedIds={parkingSlotIds}
                      heldIds={draft.parkingSlotIds ?? []}
                      onChange={(ids) => setParking({ buildingId, ids })}
                      disabled={pending}
                    />
                  </section>
                )}
                <div
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-primary/5 px-4 py-3 text-sm"
                  aria-live="polite"
                >
                  <span className="text-muted-foreground">New total</span>
                  {current?.success ? (
                    <span className="text-base font-semibold text-primary tabular-nums">
                      {peso(current.total, current.currency)}
                    </span>
                  ) : (
                    <span className={current ? "text-destructive" : "text-muted-foreground"}>
                      {current && !current.success
                        ? current.message
                        : buildingId && unitIds.length
                          ? "Calculating…"
                          : "Select a unit"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Old units go back to Available. Payments stay on the bill.
                </p>
                <div className="flex justify-end gap-2">
                  <DialogClose className={buttonVariants({ variant: "ghost" })}>Cancel</DialogClose>
                  <Button type="button" onClick={save} disabled={pending || !current?.success}>
                    {pending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
