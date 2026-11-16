import { describe, expect, it } from "vitest";
import { stagesAfterPayment } from "./payment-stage";

const stages = [
  { id: "1", slug: "leads", isWonStage: false },
  { id: "2", slug: "opportunity", isWonStage: false },
  { id: "3", slug: "reservation", isWonStage: false },
  { id: "4", slug: "closed-won", isWonStage: true },
];
const ids = (classification: string, from: string, list = stages) =>
  stagesAfterPayment(classification, from, list).map((s) => s.id);

describe("stagesAfterPayment", () => {
  it("moves Opportunity to Reservation on a reservation payment", () => {
    expect(ids("reservation", "opportunity")).toEqual(["3"]);
  });

  it("moves Reservation to Won on a monthly payment", () => {
    expect(ids("monthly", "reservation")).toEqual(["4"]);
  });

  it("takes a full payment straight to Won, one stage at a time", () => {
    expect(ids("full_payment", "opportunity")).toEqual(["3", "4"]);
    expect(ids("full_payment", "reservation")).toEqual(["4"]);
  });

  it("leaves other stages and classifications alone", () => {
    expect(ids("monthly", "opportunity")).toEqual([]);
    expect(ids("reservation", "reservation")).toEqual([]);
    expect(ids("monthly", "closed-won")).toEqual([]);
    expect(ids("full_payment", "leads")).toEqual([]);
    expect(ids("full_payment", "closed-won")).toEqual([]);
  });

  it("moves nowhere when a stage on the way is missing", () => {
    const noReservation = stages.filter((s) => s.slug !== "reservation");
    expect(ids("full_payment", "opportunity", noReservation)).toEqual([]);
  });
});
