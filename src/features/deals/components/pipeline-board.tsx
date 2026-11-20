"use client";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowRight,
  CalendarClock,
  Clock,
  Eye,
  Lock,
  TrendingDown,
  Trophy,
  X,
  XCircle,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { changeDealStage } from "../actions/deal.actions";
import {
  canActOnDeal,
  canMoveDealToStage,
  dropHintFor,
  dropHintTone,
  reasonPromptFor,
  type DropHint,
  type MoveRole,
  type MoveStage,
  type ReasonPrompt,
  paymentNeededFor,
} from "../lib/stage-move";
import { dealLabel } from "../lib/deal-label";
import { NO_RESERVATION_MESSAGE } from "../lib/stage-transitions";
import { BOARD_COLUMN_LIMIT } from "../lib/board-limit";
import { formatContactName } from "@/features/contacts";
import { notify } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { OpportunityDialog } from "./opportunity-dialog";
import { isCloseDateOverdue } from "../lib/close-date";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { manilaDateTime } from "@/lib/utils/manila-time";

/** A lane: the shared `MoveStage` shape, under the board's own name for it. */
type Stage = MoveStage;

type Deal = {
  id: string;
  code: string;
  title: string;
  /** The development the deal is sold against, which is what the card names. */
  developmentName: string | null;
  /** The storey, spelled as the floor row spells it ("5th Floor"). */
  floorLabel: string | null;
  unitCode: string | null;
  unitCodes: string | null;
  stageId: string;
  amount: string | null;
  currency: string;
  probability: string;
  expectedCloseDate: string | null;
  updatedAt: Date;
  propertyTitle: string | null;
  agentFirstName: string | null;
  agentLastName: string | null;
  brokerFirstName: string | null;
  brokerLastName: string | null;
  /** The broker handles the deal as its agent too. */
  agentIsBroker: boolean;
  agentRoleNames: string | null;
  brokerRoleNames: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
  creatorRoleNames: string | null;
  contactFirstName: string | null;
  contactMiddleName: string | null;
  contactLastName: string | null;
  nextAction: string | null;
  financingType: string | null;
  lastStageNote: string | null;
  lastStageChangedAt: string | null;
  cancellationReason: string | null;
  pendingApprovalStage: string | null;
  reservationPaid: boolean;
  firstMonthPaid: boolean;
};

/** A drop parked until the reason dialog is confirmed or dismissed. */
type ReasonRequest = {
  dealId: string;
  stageId: string;
  dealTitle: string;
  fromStageName: string | null;
  stageName: string;
  allowTerminalOutcome: boolean;
  expectPending: boolean;
  prompt: ReasonPrompt;
};

const dealDragId = (id: string) => `deal:${id}`;
const stageDropId = (id: string) => `stage:${id}`;
const fromDragId = (id: string | number) => String(id).slice("deal:".length);
const fromDropId = (id: string | number) => String(id).slice("stage:".length);

const boardCollisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

export function PipelineBoard({
  stages,
  deals,
  canChangeStage,
  canApproveStageChange,
  canMoveBack,
  userRole,
  resumeOpportunityId,
}: {
  stages: Stage[];
  deals: Deal[];
  canChangeStage: boolean;
  canApproveStageChange?: boolean;
  /** Holds `deals.move_back`. */
  canMoveBack?: boolean;
  userRole?: MoveRole;
  resumeOpportunityId?: string;
}) {
  const [items, setItems] = useState(deals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reasonRequest, setReasonRequest] = useState<ReasonRequest | null>(null);
  const [opportunityRequest, setOpportunityRequest] = useState<{
    dealId: string;
    stageId: string;
    dealTitle: string;
  } | null>(() => {
    const deal = deals.find((row) => row.id === resumeOpportunityId);
    const opportunity = stages.find((stage) => stage.slug === "opportunity");
    return canChangeStage &&
      deal &&
      opportunity &&
      stages.find((stage) => stage.id === deal.stageId)?.slug === "leads"
      ? { dealId: deal.id, stageId: opportunity.id, dealTitle: owner(deal) }
      : null;
  });
  const router = useRouter();

  const [syncedDeals, setSyncedDeals] = useState(deals);
  if (deals !== syncedDeals) {
    setSyncedDeals(deals);
    setItems(deals);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const sortedStages = [...stages].sort((a, b) => {
    const aIsExit = a.isLostStage || a.isCancelledStage;
    const bIsExit = b.isLostStage || b.isCancelledStage;
    if (aIsExit && !bIsExit) return 1;
    if (!aIsExit && bIsExit) return -1;
    return a.position - b.position;
  });

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(fromDragId(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setDragOverStageId(event.over ? fromDropId(event.over.id) : null);
  }

  function clearDrag() {
    setDraggingId(null);
    setDragOverStageId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const dealId = fromDragId(event.active.id);
    const stageId = event.over ? fromDropId(event.over.id) : null;
    clearDrag();
    if (stageId) drop(dealId, stageId);
  }

  function handleStageChange(
    dealId: string,
    stageId: string,
    note: string,
    options: { allowTerminalOutcome?: boolean; expectPending?: boolean } = {},
  ) {
    const before = items.find((d) => d.id === dealId);
    const toStage = sortedStages.find((s) => s.id === stageId);
    if (!before || !toStage) return;

    const previousStageId = before.stageId;
    const rollback = () =>
      setItems((current) =>
        current.map((d) => (d.id === dealId ? { ...d, stageId: previousStageId } : d)),
      );

    if (!options.expectPending) {
      setItems((current) => current.map((d) => (d.id === dealId ? { ...d, stageId } : d)));
    }

    startTransition(async () => {
      const result = await changeDealStage({ dealId, stageId, note }, options);
      if (!result.success) {
        if (!options.expectPending) rollback();
        notify(`Could not move to ${toStage.name}`, "error", {
          id: `stage-move-${dealId}`,
          description: result.error.message || "Refresh the pipeline and try the move again.",
        });
      } else if (result.data.approvalRequested) {
        if (!options.expectPending) rollback();
        notify("Move sent for approval", "success", {
          description: `A manager must approve the move to ${toStage.name}. The opportunity stays in its current stage until then.`,
        });
      } else {
        notify(`Moved to ${toStage.name}`, "success");
      }
    });
  }

  function drop(dealId: string, stageId: string) {
    if (!canChangeStage) return;
    const before = items.find((d) => d.id === dealId);
    if (!before || before.stageId === stageId) return;

    const toStage = sortedStages.find((s) => s.id === stageId);
    if (!toStage) return;

    // UI-level validation before the server call, mirroring the server's rules.
    if (!canMoveDealToStage(before, toStage, sortedStages, canChangeStage, userRole, canMoveBack)) {
      const paymentMessage = paymentNeededFor(
        before,
        sortedStages.find((s) => s.id === before.stageId),
        toStage,
      );
      const automaticReservation = paymentMessage === NO_RESERVATION_MESSAGE;
      notify(
        automaticReservation ? "Reservation is automatic" : `Cannot move to ${toStage.name}`,
        automaticReservation ? "info" : "error",
        {
          id: `stage-move-${dealId}`,
          description:
            paymentMessage ??
            "Your permissions or the current pipeline stage prevent this move. Open the opportunity to see the available stage changes.",
        },
      );
      return;
    }

    const fromStage = sortedStages.find((s) => s.id === before.stageId);
    if ((fromStage?.slug === "leads" || fromStage?.isLostStage) && toStage.slug === "opportunity") {
      setOpportunityRequest({ dealId, stageId, dealTitle: owner(before) });
      return;
    }
    const canApprove = Boolean(canApproveStageChange);
    const promptFor = reasonPromptFor(fromStage, toStage, canApprove);
    const allowTerminalOutcome = toStage.isLostStage;
    const expectPending = !canApprove && toStage.requiresApproval;

    if (promptFor) {
      setReasonRequest({
        dealId,
        stageId,
        dealTitle: dealLabel(before),
        fromStageName: fromStage?.name ?? null,
        stageName: toStage.name,
        allowTerminalOutcome,
        expectPending,
        prompt: promptFor,
      });
      return;
    }

    handleStageChange(dealId, stageId, "", {
      allowTerminalOutcome,
      expectPending,
    });
  }

  // The dialog confirmed a reason: now send the move that was waiting on it.
  function submitReason(reason: string) {
    const request = reasonRequest;
    if (!request) return;
    setReasonRequest(null);
    handleStageChange(request.dealId, request.stageId, reason, {
      allowTerminalOutcome: request.allowTerminalOutcome,
      expectPending: request.expectPending,
    });
  }

  const draggingDeal = draggingId ? (items.find((d) => d.id === draggingId) ?? null) : null;

  return (
    <TooltipProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDrag}
      >
        <div className="flex flex-col">
          <div className="flex snap-x gap-4 overflow-x-auto overscroll-x-contain pb-4 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent">
            {sortedStages.map((stage) => (
              <StageLane
                key={stage.id}
                stage={stage}
                rows={items.filter((d) => d.stageId === stage.id)}
                stages={sortedStages}
                canChangeStage={canChangeStage}
                canApprove={Boolean(canApproveStageChange)}
                userRole={userRole}
                canMoveBack={canMoveBack}
                pending={pending}
                isDropTarget={dragOverStageId === stage.id}
                dropHint={
                  draggingDeal
                    ? dropHintFor(
                        draggingDeal,
                        stage,
                        sortedStages,
                        canChangeStage,
                        userRole,
                        Boolean(canApproveStageChange),
                        canMoveBack,
                      )
                    : null
                }
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingDeal ? <DealDragPreview deal={draggingDeal} /> : null}
        </DragOverlay>

        {reasonRequest && (
          <ReasonDialog
            request={reasonRequest}
            onCancel={() => setReasonRequest(null)}
            onConfirm={submitReason}
          />
        )}
        {opportunityRequest && (
          <OpportunityDialog
            {...opportunityRequest}
            onClose={() => setOpportunityRequest(null)}
            onDone={(result) => {
              const { dealId, stageId } = opportunityRequest;
              setOpportunityRequest(null);
              if (result.success && !result.data.approvalRequested) {
                setItems((current) =>
                  current.map((d) => (d.id === dealId ? { ...d, stageId } : d)),
                );
              }
              router.refresh();
            }}
          />
        )}
      </DndContext>
    </TooltipProvider>
  );
}

function StageLane({
  stage,
  rows,
  stages,
  canChangeStage,
  canApprove,
  userRole,
  canMoveBack,
  pending,
  isDropTarget,
  dropHint,
}: {
  stage: Stage;
  rows: Deal[];
  stages: Stage[];
  canChangeStage: boolean;
  canApprove: boolean;
  userRole?: MoveRole;
  canMoveBack?: boolean;
  pending: boolean;
  isDropTarget: boolean;
  dropHint: DropHint | null;
}) {
  const { setNodeRef } = useDroppable({ id: stageDropId(stage.id) });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[85vw] max-w-[272px] shrink-0 snap-start flex-col rounded-xl bg-muted/40 transition-colors sm:w-[272px]",
        isDropTarget && canChangeStage && "bg-primary/5 ring-2 ring-inset ring-primary/30",
      )}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3 pb-1.5">
        <h2 className="truncate text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {stage.name}
        </h2>
        {stage.isWonStage && (
          <Trophy
            className="size-3.5 text-emerald-600 dark:text-emerald-400"
            aria-label="Won stage"
          />
        )}
        {stage.isLostStage && (
          <TrendingDown
            className="size-3.5 text-red-600 dark:text-red-400"
            aria-label="Lost stage"
          />
        )}
        {stage.isCancelledStage && (
          <CalendarClock
            className="size-3.5 text-orange-600 dark:text-orange-400"
            aria-label="Cancelled stage"
          />
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {stage.requiresApproval && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label="Entering this stage needs approval"
                  className="inline-flex text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                >
                  <Lock aria-hidden="true" className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Needs approval to enter</TooltipContent>
            </Tooltip>
          )}
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            {rows.length}
          </span>
        </span>
      </header>
      {isDropTarget && dropHint && (
        <div className="px-2.5 pt-1.5">
          <p
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-semibold",
              dropHintTone[dropHint.tone],
            )}
          >
            {dropHint.text}
          </p>
        </div>
      )}
      <div className="flex min-h-40 flex-1 flex-col gap-2 px-2.5 pt-1.5 pb-2.5">
        {rows.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            draggable={canActOnDeal(deal, stages, canChangeStage, userRole, canMoveBack)}
            disabled={pending}
            canApprove={canApprove}
            closed={stage.isWonStage || stage.isLostStage || stage.isCancelledStage}
          />
        ))}
        {rows.length >= BOARD_COLUMN_LIMIT && (
          <Link
            href={`/pipeline/list?stage=${stage.id}`}
            className="py-1 text-center text-xs font-medium text-primary hover:underline"
          >
            See all in the list
          </Link>
        )}
        {!rows.length && (
          <div className="grid min-h-28 flex-1 place-items-center rounded-lg border border-dashed border-border/60 px-3 text-center text-xs text-muted-foreground">
            {canChangeStage
              ? `Drop opportunities into ${stage.name}`
              : `No opportunities in ${stage.name}`}
          </div>
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  draggable,
  disabled,
  canApprove,
  closed,
}: {
  deal: Deal;
  draggable: boolean;
  disabled: boolean;
  /** Approvers get a link from the waiting badge to the approvals queue. */
  canApprove: boolean;
  /** In a Won, Lost or Cancelled lane: the close date can no longer be late. */
  closed: boolean;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: dealDragId(deal.id),
    disabled: !draggable || disabled,
  });

  const overdue = isCloseDateOverdue(deal.expectedCloseDate, closed);
  const place = placeOf(deal);
  const creator =
    [deal.creatorFirstName, deal.creatorLastName].filter(Boolean).join(" ") || "Unknown user";
  const broker = [deal.brokerFirstName, deal.brokerLastName].filter(Boolean).join(" ");
  const agentLabel = `${deal.agentRoleNames ?? "Agent"}: ${agentName(deal)}`;
  const brokerLabel = `${deal.brokerRoleNames ?? "Broker"}: ${broker}`;
  const creatorLabel = `Created by: ${creator}`;

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : undefined }}
      className={cn(
        "group relative rounded-xl border border-border/70 bg-card p-3 transition-colors",
        draggable && "cursor-grab touch-manipulation active:cursor-grabbing",
        "hover:border-primary/35",
      )}
    >
      <div className="flex items-start gap-1.5">
        <Link
          href={`/deals/${deal.id}`}
          draggable={false}
          className="min-w-0 flex-1 rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="pt-1.5 line-clamp-2 text-[13px] leading-5 font-semibold text-foreground [overflow-wrap:anywhere] hover:underline">
            {owner(deal)}
          </span>
          {place && (
            <span
              className="mt-1 block truncate text-xs leading-relaxed text-muted-foreground"
              title={place}
            >
              {place}
            </span>
          )}
        </Link>
        <span className="flex shrink-0 items-center gap-0.5">
          <Link
            href={`/deals/${deal.id}`}
            draggable={false}
            aria-label={`View ${dealLabel(deal)}`}
            title={`View ${dealLabel(deal)}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Eye aria-hidden="true" className="size-3.5" />
          </Link>
        </span>
      </div>
      {(deal.nextAction || deal.expectedCloseDate) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          {deal.nextAction && (
            <span className="min-w-0 truncate text-[11px] text-foreground/70">
              Next: {deal.nextAction}
            </span>
          )}
          {deal.expectedCloseDate && (
            <span
              title="Expected close date"
              className={cn(
                "flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground",
                overdue && "text-red-600 dark:text-red-400",
              )}
            >
              <CalendarClock aria-hidden="true" className="size-3.5" />
              <time dateTime={deal.expectedCloseDate}>{deal.expectedCloseDate}</time>
            </span>
          )}
        </div>
      )}
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-xs leading-5">
        <span
          className="col-span-2 truncate text-[11px] text-muted-foreground"
          title={creatorLabel}
        >
          {creatorLabel}
        </span>
        {agentName(deal) && (
          <span className="truncate font-medium text-foreground" title={agentLabel}>
            {agentLabel}
          </span>
        )}
        {agentName(deal) && (
          <div title={agentLabel} aria-hidden="true">
            <InitialsAvatar initials={initials(deal)} className="size-6 text-[10px]" />
          </div>
        )}
        {broker && !deal.agentIsBroker && (
          <span
            className="col-span-2 truncate text-[11px] text-muted-foreground"
            title={brokerLabel}
          >
            {brokerLabel}
          </span>
        )}
      </div>
      {deal.pendingApprovalStage &&
        (canApprove ? (
          <Link
            href="/pipeline/approvals"
            draggable={false}
            className="mt-1.5 flex items-start gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-500/20 hover:underline dark:text-sky-300"
          >
            <Clock className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-2">Review approval → {deal.pendingApprovalStage}</span>
          </Link>
        ) : (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-300">
            <Clock className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-2">Awaiting approval → {deal.pendingApprovalStage}</span>
          </div>
        ))}
      {/* Note/Reason display */}
      {(deal.lastStageNote || deal.cancellationReason) && (
        <div className="mt-2.5 flex items-start gap-1.5 border-t border-border/40 pt-2">
          {deal.cancellationReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="flex items-start gap-1.5 rounded-md bg-orange-500/10 px-2 py-1 text-xs text-orange-700 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-orange-400"
                >
                  <XCircle className="mt-0.5 size-3 shrink-0" />
                  <span className="line-clamp-2">Cancelled: {deal.cancellationReason}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium">Cancellation reason</p>
                <p className="mt-1 text-xs">{deal.cancellationReason}</p>
              </TooltipContent>
            </Tooltip>
          ) : deal.lastStageNote ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="flex min-w-0 items-start gap-2 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <MessageSquare aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-2 leading-relaxed [overflow-wrap:anywhere]">
                    {deal.lastStageNote === "Deal opened when the contact was created"
                      ? "Lead created"
                      : deal.lastStageNote}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium">Last stage note</p>
                <p className="mt-1 text-xs">{deal.lastStageNote}</p>
                {deal.lastStageChangedAt && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Changed: {manilaDateTime(new Date(deal.lastStageChangedAt))}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}
    </article>
  );
}

function DealDragPreview({ deal }: { deal: Deal }) {
  return (
    <div className="w-[280px] max-w-[85vw] rotate-2 rounded-lg border border-primary/40 bg-card p-2.5 shadow-lg">
      <p className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
        {owner(deal)}
      </p>
      {placeOf(deal) && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{placeOf(deal)}</p>
      )}
    </div>
  );
}

function ReasonDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ReasonRequest;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const destructive = Boolean(request.prompt.destructive);
  const trimmed = reason.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <DialogPopup className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-semibold leading-tight">
                  {request.prompt.title}
                </DialogTitle>
                <p className="mt-1 truncate text-[13px] text-muted-foreground">
                  {request.dealTitle}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  {request.fromStageName && (
                    <>
                      <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
                        {request.fromStageName}
                      </span>
                      <ArrowRight
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="to"
                      />
                    </>
                  )}
                  <span
                    className={cn(
                      "rounded px-2 py-1",
                      destructive
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {request.stageName}
                  </span>
                </p>
              </div>
              <DialogClose
                aria-label="Close"
                className="-mt-1 -mr-1 grid size-8 shrink-0 place-content-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <X aria-hidden="true" className="size-4" />
              </DialogClose>
            </div>

            <form onSubmit={handleSubmit} className="mt-5">
              <label className="grid gap-1.5">
                <span className="text-[13px] font-medium">{request.prompt.label}</span>
                <Textarea
                  autoFocus
                  required
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={request.prompt.placeholder}
                  className="w-full resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25"
                />
              </label>
              <DialogDescription className="mt-1.5 text-xs text-muted-foreground">
                {request.prompt.description ?? "Saved to the opportunity's history."}
              </DialogDescription>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={destructive ? "danger" : "primary"}
                  disabled={!trimmed}
                >
                  {request.prompt.confirmLabel}
                </Button>
              </div>
            </form>
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

/** The agent's initials; the contact already titles the card. */
function initials(deal: Deal) {
  return `${deal.agentFirstName?.[0] ?? ""}${deal.agentLastName?.[0] ?? ""}`.toUpperCase() || "—";
}

function agentName(deal: Deal) {
  return [deal.agentFirstName, deal.agentLastName].filter(Boolean).join(" ");
}

/** Only property details: the client already titles the card. */
function placeOf(deal: Deal) {
  const units = deal.unitCodes ? `Units ${deal.unitCodes}` : null;
  const building = deal.propertyTitle !== deal.developmentName ? deal.propertyTitle : null;
  return [deal.developmentName, building, units].filter(Boolean).join(" · ");
}

function owner(deal: Deal) {
  if (deal.contactFirstName) {
    return formatContactName({
      firstName: deal.contactFirstName,
      middleName: deal.contactMiddleName,
      lastName: deal.contactLastName,
    });
  }
  if (deal.agentFirstName) return `${deal.agentFirstName} ${deal.agentLastName ?? ""}`.trim();
  return "Unassigned";
}
