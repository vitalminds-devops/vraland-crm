"use client";
import {
  cloneElement,
  useId,
  useState,
  useTransition,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRightLeft, Trash2, X } from "lucide-react";
import { changeDealStage, type DealActionResult } from "../actions/deal.actions";
import { deleteDeal } from "../actions/deal-delete.actions";
import {
  canMoveDealToStage,
  dropHintFor,
  dropHintTone,
  reasonPromptFor,
  type MoveRole,
  type MoveStage,
} from "../lib/stage-move";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";
import { OpportunityDialog } from "./opportunity-dialog";

type Mode = "stage" | "delete";

export function DealActions({
  dealId,
  dealTitle,
  currentStageId,
  reservationPaid,
  firstMonthPaid,
  stages,
  canChangeStage,
  canDelete,
  canApproveStageChange,
  canMoveBack,
  userRole,
  resumeOpportunityId,
}: {
  dealId: string;
  dealTitle: string;
  currentStageId: string;
  reservationPaid: boolean;
  firstMonthPaid: boolean;
  stages: MoveStage[];
  canChangeStage: boolean;
  /** Holds `deals.delete`. */
  canDelete?: boolean;
  /** Whether this viewer's gated moves land rather than being parked. */
  canApproveStageChange?: boolean;
  /** Holds `deals.move_back`. */
  canMoveBack?: boolean;
  /** Decides which lanes may be left and how far back a move may unwind. */
  userRole?: MoveRole;
  resumeOpportunityId?: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, startTransition] = useTransition();
  const [targetStageId, setTargetStageId] = useState("");
  const [opportunityStageId, setOpportunityStageId] = useState<string | null>(() =>
    resumeOpportunityId === dealId &&
    canChangeStage &&
    stages.find((stage) => stage.id === currentStageId)?.slug === "leads"
      ? (stages.find((stage) => stage.slug === "opportunity")?.id ?? null)
      : null,
  );
  const router = useRouter();

  function run(action: () => Promise<DealActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (!result.success && mode === "stage") {
        notify("Opportunity has not moved", "error", {
          id: `stage-move-${dealId}`,
          description: result.error.message || "Refresh the pipeline and try again.",
        });
      } else
        notify(
          result.success
            ? result.data.message || "Saved."
            : result.error.message || "Couldn't save. Try again.",
          result.success ? "success" : "error",
        );
      if (result.success) setMode(null);
    });
  }

  function open(next: Mode) {
    setTargetStageId("");
    setMode(next);
  }

  function close() {
    setMode(null);
    setTargetStageId("");
  }

  const moveDeal = {
    stageId: currentStageId,
    reservationPaid,
    firstMonthPaid,
  };
  const fromStage = stages.find((stage) => stage.id === currentStageId);
  const stageChoices = stages.filter((stage) =>
    canMoveDealToStage(moveDeal, stage, stages, canChangeStage, userRole, canMoveBack),
  );
  const targetStage = stageChoices.find((stage) => stage.id === targetStageId);
  const prompt = targetStage
    ? reasonPromptFor(fromStage, targetStage, Boolean(canApproveStageChange))
    : null;
  const hint = targetStage
    ? dropHintFor(
        moveDeal,
        targetStage,
        stages,
        canChangeStage,
        userRole,
        Boolean(canApproveStageChange),
        canMoveBack,
      )
    : null;
  const willBeParked = Boolean(
    targetStage && !canApproveStageChange && targetStage.requiresApproval,
  );
  const hasStageChoice = stageChoices.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canChangeStage && (
        <Button variant="secondary" className="gap-2" onClick={() => open("stage")}>
          <ArrowRightLeft aria-hidden="true" className="size-4" />
          Change stage
        </Button>
      )}
      {canDelete && (
        <Button variant="danger" className="gap-2" onClick={() => open("delete")}>
          <Trash2 aria-hidden="true" className="size-4" />
          Delete opportunity
        </Button>
      )}

      {opportunityStageId && (
        <OpportunityDialog
          dealId={dealId}
          stageId={opportunityStageId}
          dealTitle={dealTitle}
          onClose={() => setOpportunityStageId(null)}
          onDone={() => {
            setOpportunityStageId(null);
            router.refresh();
          }}
        />
      )}

      {mode === "stage" && (
        <ActionDialog
          title={prompt?.title ?? "Change stage"}
          description={prompt?.description ?? "Pick the next stage."}
          onClose={close}
        >
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!targetStage) return;
              if (
                (fromStage?.slug === "leads" || fromStage?.isLostStage) &&
                targetStage.slug === "opportunity"
              ) {
                setMode(null);
                setOpportunityStageId(targetStage.id);
                return;
              }
              const form = new FormData(event.currentTarget);
              run(() =>
                changeDealStage(
                  {
                    dealId,
                    stageId: targetStage.id,
                    note: String(form.get("note") ?? ""),
                  },
                  { allowTerminalOutcome: targetStage.isLostStage },
                ),
              );
            }}
          >
            <div className="mt-4 grid gap-4">
              <Field label="Move to">
                <NativeSelect
                  required
                  value={targetStageId}
                  disabled={!hasStageChoice}
                  onChange={(event) => setTargetStageId(event.target.value)}
                >
                  <NativeSelectOption value="" disabled>
                    Choose a stage
                  </NativeSelectOption>
                  {stageChoices.map((stage) => (
                    <NativeSelectOption key={stage.id} value={stage.id}>
                      {stage.requiresApproval ? `${stage.name} — needs approval` : stage.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              {hint && (
                <p
                  className={cn(
                    "-mt-2 rounded-md px-2 py-1 text-[11px] font-semibold",
                    dropHintTone[hint.tone],
                  )}
                >
                  {hint.text}
                </p>
              )}
              {prompt && (
                <Field label={prompt.label}>
                  <Textarea
                    required
                    name="note"
                    rows={3}
                    placeholder={prompt.placeholder}
                    className={cn(field, "resize-none")}
                  />
                </Field>
              )}
            </div>
            {!hasStageChoice && (
              <p className="mt-3 text-xs text-muted-foreground">
                No stage reachable from {fromStage?.name ?? "this stage"}.
              </p>
            )}
            <Footer
              onCancel={close}
              pending={pending}
              tone={prompt?.destructive ? "danger" : "primary"}
              label={
                prompt?.confirmLabel ?? (willBeParked ? "Send for approval" : "Move opportunity")
              }
              disabled={!targetStage}
            />
          </form>
        </ActionDialog>
      )}

      {mode === "delete" && (
        <ActionDialog title="Delete opportunity?" description={dealTitle} onClose={close}>
          <form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await deleteDeal({ dealId });
                if (!result.success) {
                  notify(result.error.message || "Couldn't delete. Try again.", "error");
                  return;
                }
                notify("Opportunity deleted.", "success");
                router.push("/pipeline");
              });
            }}
          >
            <Footer onCancel={close} pending={pending} label="Delete opportunity" tone="danger" />
          </form>
        </ActionDialog>
      )}
    </div>
  );
}

function ActionDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
                <DialogDescription className="mt-1 text-[13px] text-muted-foreground">
                  {description}
                </DialogDescription>
              </div>
              <DialogClose
                aria-label="Close"
                className="-mt-1 -mr-1 grid size-8 shrink-0 place-content-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </DialogClose>
            </header>
            {children}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{
    id?: string;
    "aria-describedby"?: string;
  }>;
}) {
  const controlId = useId();
  const hintId = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={controlId} className="text-[13px] font-medium text-foreground">
        {label}
      </Label>
      {cloneElement(children, {
        id: controlId,
        "aria-describedby": hint ? hintId : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Footer({
  onCancel,
  pending,
  label,
  tone = "primary",
  disabled,
}: {
  onCancel: () => void;
  pending: boolean;
  label: string;
  tone?: "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={tone} disabled={pending || disabled}>
        {label}
      </Button>
    </div>
  );
}

const field =
  "w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60";
