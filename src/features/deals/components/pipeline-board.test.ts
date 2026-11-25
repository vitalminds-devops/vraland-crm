import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PipelineBoard } from "./pipeline-board";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/deal.actions", () => ({ changeDealStage: vi.fn() }));
vi.mock("./opportunity-dialog", () => ({
  OpportunityDialog: ({ dealId }: { dealId: string }) =>
    createElement("div", { "data-opportunity-draft": dealId }),
}));
vi.mock("@/features/contacts", async () => import("@/features/contacts/lib/helpers"));

type Props = ComponentProps<typeof PipelineBoard>;
const stage: Props["stages"][number] = {
  id: "opportunity",
  name: "Opportunity",
  slug: "opportunity",
  position: 1,
  isWonStage: false,
  isLostStage: false,
  isCancelledStage: false,
  requiresApproval: false,
};
const deal: Props["deals"][number] = {
  id: "deal",
  code: "DEAL-123",
  title: "Test lead",
  developmentName: "Fairfield Heights",
  floorLabel: null,
  unitCode: null,
  unitCodes: null,
  stageId: stage.id,
  amount: "0",
  currency: "PHP",
  probability: "40",
  expectedCloseDate: null,
  updatedAt: new Date("2026-11-20"),
  propertyTitle: null,
  agentFirstName: "Assigned",
  agentLastName: "Agent",
  brokerFirstName: null,
  brokerLastName: null,
  agentIsBroker: false,
  agentRoleNames: null,
  brokerRoleNames: null,
  creatorFirstName: "Original",
  creatorLastName: "Creator",
  creatorRoleNames: "Administrator",
  contactFirstName: "Test",
  contactMiddleName: null,
  contactLastName: "Lead",
  nextAction: null,
  financingType: null,
  lastStageNote: null,
  lastStageChangedAt: null,
  cancellationReason: null,
  pendingApprovalStage: null,
  reservationPaid: false,
  firstMonthPaid: false,
};

it("credits the original lead creator separately from the assigned agent", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, { stages: [stage], deals: [deal], canChangeStage: false }),
  );
  expect(html).toContain("Created by: Original Creator");
  expect(html).not.toContain("Administrator: Original Creator");
  expect(html).not.toContain("Entered by");
  expect(html).toContain("Agent: Assigned Agent");
  expect(html).not.toContain("Broker:");
  expect(html).toContain("Agent: Assigned Agent");
  expect(html).not.toContain("DEAL-123");
  expect(html).toContain("Fairfield Heights");
  expect(html).toContain('href="/deals/deal"');
});

it("does not substitute an assignee when the original creator is unavailable", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [{ ...deal, creatorFirstName: null, creatorLastName: null, creatorRoleNames: null }],
      canChangeStage: false,
    }),
  );
  expect(html).toContain("Unknown user");
  expect(html).toContain('title="Created by: Unknown user"');
});

it("shows the client once and omits missing property and close-date placeholders", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [{ ...deal, title: "LEAD, TEST", developmentName: null }],
      canChangeStage: false,
    }),
  );
  const text = html.replace(/<[^>]+>/g, "");
  expect(text.match(/Lead, Test/g)).toHaveLength(1);
  expect(html).not.toContain("lucide-calendar-clock");
  expect(html).not.toContain("<time");
  expect(html).toContain("Created by: Original Creator");
  expect(html).not.toContain("Entered by");
});

it("keeps real close dates, next actions and stage notes visible", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [
        {
          ...deal,
          expectedCloseDate: "2099-11-20",
          nextAction: "Call the client",
          lastStageNote: "Confirm the client's preferred units.",
        },
      ],
      canChangeStage: false,
    }),
  );
  expect(html).toMatch(/datetime="2099-11-20"/i);
  expect(html).toContain("Next: Call the client");
  expect(html).toContain("Confirm the client&#x27;s preferred units.");
  expect(html).toContain('tabindex="0"');
});

it.each(["Deal opened when the contact was created", "Lead created"])(
  "shows a short creation note for %s",
  (lastStageNote) => {
    const html = renderToStaticMarkup(
      createElement(PipelineBoard, {
        stages: [stage],
        deals: [{ ...deal, lastStageNote }],
        canChangeStage: false,
      }),
    );
    expect(html.replace(/<[^>]+>/g, "")).toContain("Lead created");
    expect(html.replace(/<[^>]+>/g, "")).not.toContain("Deal opened when the contact was created");
  },
);

it("keeps the complete unit list available in the property tooltip", () => {
  const unitCodes = Array.from({ length: 20 }, (_, index) => `2${index + 1}`).join(", ");
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [{ ...deal, unitCodes }],
      canChangeStage: false,
    }),
  );
  expect(html).toContain(`title="Fairfield Heights · Units ${unitCodes}"`);
});

it("lists an opportunity's parking after its units on the card", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [{ ...deal, unitCodes: "2A", parkingCodes: "P1, P12" }],
      canChangeStage: false,
    }),
  );
  expect(html).toContain("Fairfield Heights · Units 2A · Parking P1, P12");
});

it("reopens an authorized lead's saved opportunity form after refresh", () => {
  const leads = { ...stage, id: "leads", slug: "leads", position: 0 };
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [leads, stage],
      deals: [{ ...deal, stageId: "leads" }],
      canChangeStage: true,
      resumeOpportunityId: deal.id,
    }),
  );
  expect(html).toContain('data-opportunity-draft="deal"');
});

it.each([false, true])(
  "does not resume an inaccessible or completed lead (permission %s)",
  (canChangeStage) => {
    const html = renderToStaticMarkup(
      createElement(PipelineBoard, {
        stages: [stage],
        deals: [deal],
        canChangeStage,
        resumeOpportunityId: deal.id,
      }),
    );
    expect(html).not.toContain("data-opportunity-draft");
  },
);

it("names the broker beside the agent, or once when the broker is the agent", () => {
  const render = (changes: Partial<typeof deal>) =>
    renderToStaticMarkup(
      createElement(PipelineBoard, {
        stages: [stage],
        deals: [{ ...deal, brokerFirstName: "Main", brokerLastName: "Broker", ...changes }],
        canChangeStage: false,
      }),
    );
  const separate = render({});
  expect(separate).toContain("Agent: Assigned Agent");
  expect(separate).toContain("Broker: Main Broker");
  const same = render({
    agentFirstName: "Main",
    agentLastName: "Broker",
    agentIsBroker: true,
    agentRoleNames: "Broker",
  });
  expect(same).toContain("Broker: Main Broker");
  expect(same).not.toContain("Agent: ");
});

it("labels the agent and broker with their own roles", () => {
  const html = renderToStaticMarkup(
    createElement(PipelineBoard, {
      stages: [stage],
      deals: [
        {
          ...deal,
          agentRoleNames: "Sales Agent",
          brokerFirstName: "Main",
          brokerLastName: "Broker",
          brokerRoleNames: "Master Broker",
        },
      ],
      canChangeStage: false,
    }),
  );
  expect(html).toContain("Sales Agent: Assigned Agent");
  expect(html).toContain("Master Broker: Main Broker");
});
