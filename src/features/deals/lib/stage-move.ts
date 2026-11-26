import {
  MAX_BACKWARD_SKIP,
  missingPaymentFor,
  missingPaymentMessage,
  reopensLostPastGate,
  type MissingPayment,
  type PaymentProgress,
} from "./stage-transitions";

/** The tier `resolveMoveRole` resolves a user to. */
export type MoveRole = "agent" | "broker" | "sales-manager" | "admin" | "viewer";

/** The lane shape both surfaces render. */
export type MoveStage = {
  id: string;
  name: string;
  slug: string;
  isWonStage: boolean;
  isLostStage: boolean;
  isCancelledStage: boolean;
  position: number;
  requiresApproval: boolean;
};

/** Payment flags left out mean unknown here; the server still enforces them. */
export type StagedDeal = { stageId: string } & PaymentProgress;

/** Copy for the "you must give a reason" prompt, chosen by `reasonPromptFor`. */
export type ReasonPrompt = {
  title: string;
  /** Omitted where the title and the field label already say everything. */
  description?: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  /** Renders the prompt and its confirm button in the danger tone. */
  destructive?: boolean;
};

export type DropHint = {
  text: string;
  tone: "ok" | "warn" | "info" | "blocked";
};

/** Tones for the move hint: what committing to the move will do. */
export const dropHintTone: Record<DropHint["tone"], string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  blocked: "bg-muted text-muted-foreground",
};

function isWonOrCancelled(stage: MoveStage) {
  return stage.isWonStage || stage.isCancelledStage;
}

export function canActOnDeal(
  deal: StagedDeal,
  stages: MoveStage[],
  canChangeStage: boolean,
  userRole?: MoveRole,
  canMoveBack = false,
): boolean {
  if (!canChangeStage || userRole === "viewer") return false;
  const fromStage = stages.find((s) => s.id === deal.stageId);
  if (!fromStage) return false;
  // A closed deal can only be reopened, which is a move back, unless an admin changes its outcome.
  if (isWonOrCancelled(fromStage) && userRole !== "admin" && !canMoveBack) return false;
  return true;
}

export function canMoveDealToStage(
  deal: StagedDeal,
  toStage: MoveStage,
  stages: MoveStage[],
  canChangeStage: boolean,
  userRole?: MoveRole,
  canMoveBack = false,
): boolean {
  return stageMoveBlock(deal, toStage, stages, canChangeStage, userRole, canMoveBack) === null;
}

/** Why the pipeline refuses this move before asking the server, or null; `payment` names a missing payment. */
export type StageMoveBlock = { message: string; payment?: MissingPayment };

export function stageMoveBlock(
  deal: StagedDeal,
  toStage: MoveStage,
  stages: MoveStage[],
  canChangeStage: boolean,
  userRole?: MoveRole,
  canMoveBack = false,
): StageMoveBlock | null {
  const refuse = (message: string) => ({ message });
  if (!canChangeStage || userRole === "viewer")
    return refuse("You cannot change this opportunity's stage. Ask your administrator for help.");
  const fromStage = stages.find((s) => s.id === deal.stageId);
  if (!fromStage)
    return refuse("The current stage is no longer available. Refresh the pipeline and try again.");
  if (fromStage.id === toStage.id) return refuse("This opportunity is already in that stage.");
  if (reopensLostPastGate(fromStage, toStage))
    return refuse("Reopen this opportunity in Leads or Opportunity first.");

  if (toStage.position < fromStage.position) {
    if (!canMoveBack)
      return refuse("You cannot move opportunities back. Ask your administrator for help.");
    if (
      userRole !== "admin" &&
      !fromStage.isLostStage &&
      fromStage.position - toStage.position > MAX_BACKWARD_SKIP
    )
      return refuse("Move this opportunity back one stage at a time.");
    return null;
  }

  if (isWonOrCancelled(fromStage) && userRole !== "admin")
    return refuse(
      "This opportunity is closed. Ask your administrator to reopen it before changing its outcome.",
    );

  if (toStage.isLostStage || toStage.isCancelledStage) return null;

  const payment = missingPaymentFor({ from: fromStage, to: toStage, payments: deal });
  if (payment) return { message: missingPaymentMessage(payment, true), payment };

  if (toStage.position - fromStage.position > 1) {
    const nextStage = stages
      .filter(
        (stage) =>
          stage.position > fromStage.position &&
          stage.position < toStage.position &&
          !stage.isLostStage &&
          !stage.isCancelledStage,
      )
      .sort((a, b) => a.position - b.position)[0];
    return refuse(
      nextStage
        ? `Move this opportunity to ${nextStage.name} first. Stages cannot be skipped.`
        : "Move this opportunity one stage at a time. Refresh the pipeline to see the available stages.",
    );
  }
  return null;
}

/** Label for a move that will be parked for a manager to approve. */
const NEEDS_APPROVAL = "Needs approval";

export function dropHintFor(
  deal: StagedDeal,
  toStage: MoveStage,
  stages: MoveStage[],
  canChangeStage: boolean,
  userRole: MoveRole | undefined,
  canApprove: boolean,
  canMoveBack = false,
): DropHint | null {
  if (toStage.id === deal.stageId) return null;

  const blocked = stageMoveBlock(deal, toStage, stages, canChangeStage, userRole, canMoveBack);
  if (blocked)
    return {
      text:
        blocked.payment === "reservation"
          ? "Moves automatically after Billing"
          : blocked.payment === "first-month"
            ? "First monthly payment needed"
            : blocked.message,
      tone: "blocked",
    };

  const fromStage = stages.find((s) => s.id === deal.stageId);
  const steps: string[] = [];
  if (reasonPromptFor(fromStage, toStage, canApprove)) steps.push("Reason required");
  const needsApproval = !canApprove && toStage.requiresApproval;
  if (needsApproval) steps.push(NEEDS_APPROVAL);

  if (!steps.length) return { text: "Moves now", tone: "ok" };
  return { text: steps.join(" · "), tone: needsApproval ? "info" : "warn" };
}

export function reasonPromptFor(
  fromStage: MoveStage | undefined,
  toStage: MoveStage,
  canApprove: boolean,
): ReasonPrompt | null {
  if (fromStage && isWonOrCancelled(fromStage) && toStage.position < fromStage.position) {
    const outcome = fromStage.isWonStage ? "won" : "cancelled";
    return {
      title: `Reopen this ${outcome} opportunity`,
      label: "Reason",
      placeholder: "e.g. The contact's financing fell through.",
      confirmLabel: "Reopen opportunity",
    };
  }

  if (fromStage && toStage.position < fromStage.position) {
    return {
      title: "Move back a stage",
      label: "Reason",
      placeholder: "e.g. Paperwork is not complete yet.",
      confirmLabel: `Move to ${toStage.name}`,
    };
  }

  if (canApprove) return null;

  if (toStage.isCancelledStage) {
    return {
      title: "Cancel this opportunity",
      description: "The reason is shown on its card.",
      label: "Reason",
      placeholder: "e.g. The contact withdrew their offer.",
      confirmLabel: "Cancel opportunity",
      destructive: true,
    };
  }

  if (toStage.isLostStage) {
    return {
      title: "Mark as lost",
      description: "A manager may need to approve this.",
      label: "Reason",
      placeholder: "e.g. The contact chose another unit.",
      confirmLabel: "Mark lost",
      destructive: true,
    };
  }

  return null;
}
