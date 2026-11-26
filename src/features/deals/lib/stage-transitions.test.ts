import { describe, expect, it } from "vitest";

import {
  MOVE_BACK_MESSAGE,
  NO_FIRST_MONTH_MESSAGE,
  NO_RESERVATION_MESSAGE,
  missingPaymentMessage,
  missingPaymentOf,
  resolveMoveRole,
  canMoveStage,
  canStartDealInStage,
  checkStageTransition,
  closeDateFor,
  dealStatusForStage,
  type PaymentProgress,
  type Role,
} from "./stage-transitions";

const stage = (slug: string, position: number, isWonStage = false) => ({
  slug,
  position,
  isWonStage,
  isLostStage: false,
  isCancelledStage: false,
});
const leads = stage("leads", 1);
const opportunity = stage("opportunity", 2);
const reservation = stage("reservation", 3);
const won = stage("closed-won", 4, true);

const move = (
  role: Role,
  payments: PaymentProgress,
  from = opportunity,
  to = reservation,
  canMoveBack = false,
) =>
  canMoveStage({
    userId: "broker-1",
    role,
    deal: { primaryAgentUserId: "broker-1", brokerUserId: "broker-1" },
    fromStage: from,
    toStage: to,
    payments,
    canMoveBack,
  });

describe("payment guidance", () => {
  it.each([
    [
      "reservation" as const,
      NO_RESERVATION_MESSAGE,
      "Ask the billing team to record the full reservation fee. This opportunity will then move to Reservation automatically.",
    ],
    [
      "first-month" as const,
      NO_FIRST_MONTH_MESSAGE,
      "Ask the billing team to record the full first monthly payment. Then try moving this opportunity to Won again.",
    ],
  ])("tells Billing users and others what to do for %s", (missing, billing, others) => {
    expect(missingPaymentMessage(missing, true)).toBe(billing);
    expect(missingPaymentMessage(missing, false)).toBe(others);
  });

  it("reads the missing payment from a refusal's details, never its text", () => {
    expect(missingPaymentOf({ payment: "reservation" })).toBe("reservation");
    expect(missingPaymentOf({ payment: "first-month" })).toBe("first-month");
    expect(missingPaymentOf({ payment: "other" })).toBeNull();
    expect(missingPaymentOf(undefined)).toBeNull();
    expect(missingPaymentOf(MOVE_BACK_MESSAGE)).toBeNull();
  });
});

describe("payment gates", () => {
  it("lets a lead become an opportunity without a payment", () => {
    expect(move("broker", { reservationPaid: false }, leads, opportunity).allowed).toBe(true);
  });

  it("keeps an opportunity without a reservation out of Reservation", () => {
    expect(move("broker", { reservationPaid: false })).toEqual({
      allowed: false,
      message: NO_RESERVATION_MESSAGE,
      payment: "reservation",
    });
    expect(move("agent", { reservationPaid: false }).allowed).toBe(false);
  });

  it("lets an opportunity with a reservation advance", () => {
    expect(move("broker", { reservationPaid: true }).allowed).toBe(true);
  });

  it("needs the first monthly payment to reach Won", () => {
    const paid = { reservationPaid: true };
    expect(move("broker", { ...paid, firstMonthPaid: false }, reservation, won)).toEqual({
      allowed: false,
      message: NO_FIRST_MONTH_MESSAGE,
      payment: "first-month",
    });
    expect(move("broker", { ...paid, firstMonthPaid: true }, reservation, won).allowed).toBe(true);
  });

  it("holds administrators to both gates too", () => {
    expect(move("admin", { reservationPaid: false })).toEqual({
      allowed: false,
      message: NO_RESERVATION_MESSAGE,
      payment: "reservation",
    });
    expect(move("admin", { firstMonthPaid: false }, reservation, won)).toEqual({
      allowed: false,
      message: NO_FIRST_MONTH_MESSAGE,
      payment: "first-month",
    });
    expect(move("admin", { firstMonthPaid: true }, reservation, won).allowed).toBe(true);
  });

  it("does not block moving back", () => {
    expect(move("broker", { reservationPaid: false }, reservation, opportunity, true).allowed).toBe(
      true,
    );
  });

  it("opens every deal in Leads, administrators included", () => {
    expect(canStartDealInStage(leads).allowed).toBe(true);
    expect(canStartDealInStage(opportunity).allowed).toBe(false);
    expect(canStartDealInStage(reservation).allowed).toBe(false);
  });
});

describe("deal status and close date", () => {
  const stage = { isWonStage: false, isLostStage: false, isCancelledStage: false };

  it("follows the kind of stage", () => {
    expect(dealStatusForStage(stage)).toBe("open");
    expect(dealStatusForStage({ ...stage, isWonStage: true })).toBe("won");
    expect(dealStatusForStage({ ...stage, isLostStage: true })).toBe("lost");
    expect(dealStatusForStage({ ...stage, isCancelledStage: true })).toBe("cancelled");
  });

  it("stamps today on a new outcome, keeps it on the same one and clears it when reopened", () => {
    const open = { status: "open", actualCloseDate: null };
    const won = { status: "won", actualCloseDate: "2026-10-02" };
    expect(closeDateFor("won", open, "2026-11-10")).toBe("2026-11-10");
    expect(closeDateFor("won", won, "2026-11-10")).toBe("2026-10-02");
    expect(closeDateFor("lost", won, "2026-11-10")).toBe("2026-11-10");
    expect(closeDateFor("open", won, "2026-11-10")).toBeNull();
  });
});

describe("reopening a lost deal", () => {
  const lost = { ...stage("closed-lost", 5), isLostStage: true };

  it("refuses Won and Reservation, which would skip their payment gates", () => {
    expect(checkStageTransition(lost, won)).toEqual({ allowed: false, reason: "lost-reopen" });
    expect(checkStageTransition(lost, reservation)).toEqual({
      allowed: false,
      reason: "lost-reopen",
    });
  });

  it("reopens a cancelled deal only before the payment gates, like a lost one", () => {
    const cancelled = { ...lost, isLostStage: false, isCancelledStage: true };
    expect(checkStageTransition(cancelled, won)).toEqual({ allowed: false, reason: "lost-reopen" });
    expect(checkStageTransition(cancelled, reservation)).toEqual({
      allowed: false,
      reason: "lost-reopen",
    });
  });

  it("allows Leads and Opportunity", () => {
    expect(checkStageTransition(lost, leads).allowed).toBe(true);
    expect(checkStageTransition(lost, opportunity).allowed).toBe(true);
  });
});

it("lets a non-admin reopen their lost deal to Leads or Opportunity", () => {
  const lost = { ...stage("closed-lost", 5), isLostStage: true };
  for (const to of [leads, opportunity])
    expect(move("broker", {}, lost, to, true)).toEqual({ allowed: true });
});

describe("moving back", () => {
  it("is refused to non-admins without the permission", () => {
    for (const role of ["agent", "broker", "sales-manager"] as const)
      expect(move(role, {}, reservation, opportunity)).toEqual({
        allowed: false,
        message: MOVE_BACK_MESSAGE,
      });
  });

  it("needs the permission, admins included", () => {
    expect(move("admin", {}, reservation, opportunity)).toEqual({
      allowed: false,
      message: MOVE_BACK_MESSAGE,
    });
    expect(move("admin", {}, reservation, opportunity, true).allowed).toBe(true);
    expect(move("sales-manager", {}, reservation, opportunity, true).allowed).toBe(true);
  });

  it("reopens a won deal with the permission and a reason, one stage back for non-admins", () => {
    const reopen = (role: Role, note: string) =>
      canMoveStage({
        userId: "broker-1",
        role,
        deal: { primaryAgentUserId: "broker-1", brokerUserId: "broker-1" },
        fromStage: won,
        toStage: reservation,
        payments: {},
        canMoveBack: true,
        reason: note,
      });
    expect(reopen("broker", "Financing fell through").allowed).toBe(true);
    expect(reopen("broker", "").allowed).toBe(false);
  });
});

describe("resolveMoveRole", () => {
  it("picks the strongest role a user holds for moving opportunities", () => {
    const as = (roles: string[], permissions: string[] = ["deals.change_stage"]) =>
      resolveMoveRole({ roles, permissions: new Set(permissions) });
    expect(as(["agent", "master-broker"])).toBe("admin");
    expect(as(["administrator"])).toBe("admin");
    expect(as(["sales-manager", "agent"])).toBe("sales-manager");
    expect(as(["license-broker"])).toBe("broker");
    expect(as(["agent"])).toBe("agent");
    expect(as(["viewer"])).toBe("viewer");
  });

  it("moves a custom role by its data access, and not at all without the permission", () => {
    const custom = (permissions: string[]) =>
      resolveMoveRole({ roles: ["custom"], permissions: new Set(permissions) });
    expect(custom(["deals.change_stage"])).toBe("agent");
    expect(custom(["deals.change_stage", "records.view_team"])).toBe("broker");
    expect(custom(["deals.change_stage", "records.view_all"])).toBe("sales-manager");
    expect(custom(["records.view_all"])).toBe("viewer");
  });
});
