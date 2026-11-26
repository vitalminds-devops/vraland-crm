import { expect, it } from "vitest";
import { canMoveDealToStage, dropHintFor, stageMoveBlock, type MoveStage } from "./stage-move";
import { NO_FIRST_MONTH_MESSAGE, NO_RESERVATION_MESSAGE } from "./stage-transitions";

const blockedMessage = (...args: Parameters<typeof stageMoveBlock>) =>
  stageMoveBlock(...args)?.message ?? null;

const stage = (slug: string, position: number): MoveStage => ({
  id: slug,
  name: slug,
  slug,
  position,
  isWonStage: false,
  isLostStage: false,
  isCancelledStage: false,
  requiresApproval: false,
});
const stages = [stage("leads", 1), stage("opportunity", 2), stage("reservation", 3)];
const deal = { stageId: "reservation" };
const back = (role: "agent" | "admin", canMoveBack?: boolean) =>
  canMoveDealToStage(deal, stages[1], stages, true, role, canMoveBack);

it("hides moving back from anyone without the permission, admins included", () => {
  expect(back("agent")).toBe(false);
  expect(back("admin")).toBe(false);
  expect(back("agent", true)).toBe(true);
  expect(back("admin", true)).toBe(true);
});

it("directs an unpaid Opportunity to Billing for its automatic Reservation move", () => {
  const unpaid = { stageId: "opportunity", reservationPaid: false };
  expect(canMoveDealToStage(unpaid, stages[2], stages, true, "admin")).toBe(false);
  expect(dropHintFor(unpaid, stages[2], stages, true, "admin", true)).toEqual({
    text: "Moves automatically after Billing",
    tone: "blocked",
  });
});

it("lets a holder of the permission reopen a won deal, but only admins change its outcome", () => {
  const won = { ...stage("won", 4), isWonStage: true };
  const lost = { ...stage("lost", 5), isLostStage: true };
  const all = [...stages, won, lost];
  const wonDeal = { stageId: "won" };
  expect(canMoveDealToStage(wonDeal, stages[2], all, true, "agent", true)).toBe(true);
  expect(canMoveDealToStage(wonDeal, stages[2], all, true, "agent")).toBe(false);
  expect(canMoveDealToStage(wonDeal, lost, all, true, "agent", true)).toBe(false);
  expect(canMoveDealToStage(wonDeal, lost, all, true, "admin")).toBe(true);
});

it("names the next stage when an agent tries to skip directly to Won", () => {
  const reservation = { ...stages[2], name: "Reservation" };
  const won = { ...stage("won", 4), isWonStage: true };
  const all = [won, reservation, stages[0], stages[1]];
  const opportunity = { stageId: "opportunity", reservationPaid: false };
  const message = "Move this opportunity to Reservation first. Stages cannot be skipped.";
  expect(blockedMessage(opportunity, won, all, true, "agent")).toBe(message);
  expect(canMoveDealToStage(opportunity, won, all, true, "agent")).toBe(false);
  expect(dropHintFor(opportunity, won, all, true, "agent", false)).toEqual({
    text: message,
    tone: "blocked",
  });
});

it("distinguishes missing permissions from missing payments", () => {
  const opportunity = { stageId: "opportunity", reservationPaid: false };
  expect(blockedMessage(opportunity, stages[2], stages, false, "agent")).toContain(
    "Ask your administrator",
  );
  expect(blockedMessage(opportunity, stages[2], stages, true, "viewer")).toContain(
    "Ask your administrator",
  );
  expect(blockedMessage(opportunity, stages[2], stages, true, "agent")).toBe(
    NO_RESERVATION_MESSAGE,
  );
  const won = { ...stage("won", 4), isWonStage: true };
  expect(
    blockedMessage(
      { stageId: "reservation", firstMonthPaid: false },
      won,
      [...stages, won],
      true,
      "agent",
    ),
  ).toBe(NO_FIRST_MONTH_MESSAGE);
});

it("explains backward moves and lost or closed opportunities", () => {
  expect(blockedMessage(deal, stages[1], stages, true, "agent")).toContain(
    "cannot move opportunities back",
  );
  expect(blockedMessage(deal, stages[0], stages, true, "agent", true)).toBe(
    "Move this opportunity back one stage at a time.",
  );
  const won = { ...stage("won", 4), isWonStage: true };
  const lost = { ...stage("lost", 5), isLostStage: true };
  const all = [...stages, won, lost];
  expect(blockedMessage({ stageId: "won" }, lost, all, true, "agent")).toContain(
    "This opportunity is closed",
  );
  expect(blockedMessage({ stageId: "lost" }, won, all, true, "agent", true)).toBe(
    "Reopen this opportunity in Leads or Opportunity first.",
  );
});

it("provides recovery for a missing stage and leaves valid moves unblocked", () => {
  expect(blockedMessage({ stageId: "removed" }, stages[1], stages, true, "agent")).toContain(
    "Refresh the pipeline",
  );
  expect(blockedMessage(deal, stages[2], stages, true, "agent")).toBe(
    "This opportunity is already in that stage.",
  );
  expect(blockedMessage({ stageId: "leads" }, stages[1], stages, true, "agent")).toBeNull();
});

it("names the missing payment by code, so the pipeline never depends on the wording", () => {
  const won = { ...stage("won", 4), isWonStage: true };
  expect(
    stageMoveBlock(
      { stageId: "opportunity", reservationPaid: false },
      stages[2],
      stages,
      true,
      "agent",
    ),
  ).toEqual({ message: NO_RESERVATION_MESSAGE, payment: "reservation" });
  expect(
    stageMoveBlock(
      { stageId: "reservation", firstMonthPaid: false },
      won,
      [...stages, won],
      true,
      "agent",
    ),
  ).toEqual({ message: NO_FIRST_MONTH_MESSAGE, payment: "first-month" });
  expect(stageMoveBlock(deal, stages[2], stages, true, "agent")?.payment).toBeUndefined();
});
