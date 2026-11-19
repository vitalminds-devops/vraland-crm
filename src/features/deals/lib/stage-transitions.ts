import { isBrokerAccessRoleSlug } from "@/lib/permissions/catalog";

export type StagePosition = {
  /** `pipeline_stages.position`; ascending means further along the pipeline. */
  position: number;
  isWonStage: boolean;
  isLostStage: boolean;
  isCancelledStage: boolean;
  slug: string;
};

export type Role = "agent" | "broker" | "sales-manager" | "admin" | "viewer";

export type DealOwnership = {
  primaryAgentUserId: string | null;
  brokerUserId: string | null;
};

export type MoveContext = {
  userId: string;
  role: Role;
  deal: DealOwnership;
  fromStage: StagePosition;
  toStage: StagePosition;
  reason?: string;
  payments: PaymentProgress;
  /** Holds `deals.move_back`, which every move to an earlier stage needs, reopening included. */
  canMoveBack?: boolean;
};

/** What the deal's bill has been paid with, by classification. Left out means unknown; the server still checks. */
export type PaymentProgress = {
  reservationPaid?: boolean;
  firstMonthPaid?: boolean;
};

export const NO_RESERVATION_MESSAGE =
  "Before moving this opportunity to Reservation, make sure the full reservation fee is recorded in Billing. Then try the move again.";
export const NO_FIRST_MONTH_MESSAGE =
  "Before moving this opportunity to Won, make sure the first monthly payment is fully recorded in Billing. Then try the move again.";
export const MOVE_BACK_MESSAGE = "You don't have permission to move opportunities back.";

/**
 * The payment a move still needs, or null: a Reservation to enter Reservation, the first Monthly to reach Won.
 * Applies to everyone, administrators included: they record the payment in Billing first.
 */
export function missingPaymentFor(input: {
  from?: Pick<StagePosition, "slug">;
  to: Pick<StagePosition, "slug" | "isWonStage">;
  payments: PaymentProgress;
}): string | null {
  if (!input.from) return null;
  if (
    input.from.slug === "opportunity" &&
    input.to.slug === "reservation" &&
    input.payments.reservationPaid === false
  )
    return NO_RESERVATION_MESSAGE;
  if (
    input.from.slug === "reservation" &&
    input.to.isWonStage &&
    input.payments.firstMonthPaid === false
  )
    return NO_FIRST_MONTH_MESSAGE;
  return null;
}

export function resolveMoveRole(roles: readonly string[]): Role {
  if (
    roles.includes("super-administrator") ||
    roles.includes("administrator") ||
    roles.includes("master-broker")
  )
    return "admin";
  if (roles.includes("sales-manager")) return "sales-manager";
  if (roles.some(isBrokerAccessRoleSlug)) return "broker";
  if (roles.includes("agent")) return "agent";
  return "viewer";
}

export type MoveCheck = { allowed: true } | { allowed: false; message: string };

const MAX_FORWARD_SKIP = 1;

export const MAX_BACKWARD_SKIP = 1;

export type TransitionCheck =
  | { allowed: true; direction: "forward" | "backward" | "outcome" }
  | { allowed: false; reason: "unknown-stage" | "same-stage" | "skip" }
  | { allowed: false; reason: "lost-terminal" | "lost-reopen" };

/**
 * Lost sits after Won, so leaving it counts as a backward move and skips every payment gate.
 * A lost deal therefore reopens only to the lanes before the first gate.
 */
export function reopensLostPastGate(
  from: Pick<StagePosition, "isLostStage">,
  to: Pick<StagePosition, "slug">,
): boolean {
  return from.isLostStage && to.slug !== "leads" && to.slug !== "opportunity";
}

export function checkStageTransition(
  from: StagePosition | undefined,
  to: StagePosition | undefined,
  options: { allowTerminalOutcome?: boolean } = {},
): TransitionCheck {
  if (!from || !to) return { allowed: false, reason: "unknown-stage" };
  if (from.position === to.position) return { allowed: false, reason: "same-stage" };
  if (to.isLostStage && !options.allowTerminalOutcome)
    return { allowed: false, reason: "lost-terminal" };
  if (reopensLostPastGate(from, to)) return { allowed: false, reason: "lost-reopen" };
  if (to.position < from.position) return { allowed: true, direction: "backward" };
  if (to.isLostStage || to.isCancelledStage) return { allowed: true, direction: "outcome" };
  if (to.position - from.position > MAX_FORWARD_SKIP) return { allowed: false, reason: "skip" };
  return { allowed: true, direction: "forward" };
}

/** True when the move goes to an earlier stage than the deal currently sits in. */
function isBackwardMove(from: StagePosition, to: StagePosition): boolean {
  return to.position < from.position;
}

export function canMoveStage(context: MoveContext): MoveCheck {
  const { role, deal, userId, fromStage, toStage, reason } = context;

  if (role === "viewer") return { allowed: false, message: "Viewers cannot move opportunities." };

  const backward = toStage.position < fromStage.position;
  if (backward && !context.canMoveBack) return { allowed: false, message: MOVE_BACK_MESSAGE };

  const fromIsLocked = fromStage.isWonStage || fromStage.isCancelledStage;
  if (fromIsLocked) {
    // Reopening is a move back; changing a closed outcome stays with admins.
    if (!backward && role !== "admin")
      return {
        allowed: false,
        message: "Only admins can change a won or cancelled outcome.",
      };
    if (backward && !reason?.trim())
      return {
        allowed: false,
        message: "A reason is required to reopen.",
      };
    if (role === "admin") return { allowed: true };
  }

  // Agent/broker own-deal rule applies in both directions.
  if (role === "agent" && deal.primaryAgentUserId !== userId)
    return {
      allowed: false,
      message: "Agents can only move their own opportunities.",
    };
  if (role === "broker" && deal.brokerUserId !== userId)
    return {
      allowed: false,
      message: "Brokers can only move their own opportunities.",
    };

  if (backward) {
    // A lost deal sits last, so reopening it is always several lanes back; the lanes it may reach are checked above.
    if (
      role !== "admin" &&
      !fromStage.isLostStage &&
      fromStage.position - toStage.position > MAX_BACKWARD_SKIP
    )
      return {
        allowed: false,
        message: "Move back one stage at a time.",
      };
    return { allowed: true };
  }

  if (
    toStage.position - fromStage.position > 1 &&
    !toStage.isLostStage &&
    !toStage.isCancelledStage
  )
    return {
      allowed: false,
      message: "Opportunities can only move one stage at a time.",
    };

  const missingPayment = missingPaymentFor({
    from: fromStage,
    to: toStage,
    payments: context.payments,
  });
  if (missingPayment) return { allowed: false, message: missingPayment };

  return { allowed: true };
}

export type StartCheck = { allowed: true } | { allowed: false; message: string };

/** Whether an opportunity may be opened in this lane: only Leads. */
export function canStartDealInStage(
  stage: Pick<StagePosition, "isWonStage" | "isLostStage" | "isCancelledStage" | "slug">,
): StartCheck {
  if (stage.isWonStage || stage.isLostStage || stage.isCancelledStage)
    return {
      allowed: false,
      message: "Can't open an opportunity on a closed stage.",
    };
  // New deals start in Leads and move through each lane, so no payment gate is skipped.
  if (stage.slug !== "leads")
    return { allowed: false, message: "New opportunities start in Leads." };
  return { allowed: true };
}

export function requiresReason(input: {
  from: StagePosition;
  to: StagePosition;
  canApprove: boolean;
}): boolean {
  if (isBackwardMove(input.from, input.to)) return true;
  if (input.canApprove) return false;
  return input.to.isLostStage || input.to.isCancelledStage;
}

export function requiresApprovalForMove(input: {
  toRequiresApproval: boolean;
  isLostStage: boolean;
  enteredGatedStage: boolean;
  canApprove: boolean;
}): boolean {
  if (input.canApprove) return false;
  if (input.toRequiresApproval) return true;
  return input.isLostStage && input.enteredGatedStage;
}

/** Human-readable explanation for a rejected transition, for the UI. */
export function transitionMessage(
  reason: "unknown-stage" | "same-stage" | "skip" | "lost-terminal" | "lost-reopen",
): string {
  switch (reason) {
    case "lost-reopen":
      return "Reopen a lost opportunity to Leads or Opportunity.";
    case "unknown-stage":
      return "That pipeline stage is no longer available.";
    case "same-stage":
      return "The opportunity is already in that stage.";
    case "lost-terminal":
      return "Use Mark lost to record a loss reason.";
    case "skip":
      return "Stages can't be skipped.";
  }
}

export type DealStatus = "open" | "won" | "lost" | "cancelled";

/** A deal's status follows the kind of stage it sits in. */
export function dealStatusForStage(stage: {
  isWonStage: boolean;
  isLostStage: boolean;
  isCancelledStage: boolean;
}): DealStatus {
  if (stage.isWonStage) return "won";
  if (stage.isLostStage) return "lost";
  if (stage.isCancelledStage) return "cancelled";
  return "open";
}

/**
 * When a deal closed: none while open, kept while it stays in the same outcome, and today when
 * it reaches a new one. Sales reports and the forecast read this date.
 */
export function closeDateFor(
  status: DealStatus,
  before: { status: string; actualCloseDate: string | null },
  today: string,
): string | null {
  if (status === "open") return null;
  return status === before.status ? before.actualCloseDate : today;
}
