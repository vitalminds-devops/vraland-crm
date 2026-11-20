import { expect, it } from "vitest";
import { canMoveDealToStage, dropHintFor, type MoveStage } from "./stage-move";

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
