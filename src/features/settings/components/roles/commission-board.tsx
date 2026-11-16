"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CornerDownRight, GripVertical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

import {
  removeCommissionLink,
  saveCommissionLink,
  setRoleCommissionRate,
} from "../../actions/settings.actions";

type Role = {
  id: string;
  name: string;
  description: string | null;
  commissionRate: string | null;
  members: number;
};

type Link = {
  id: string;
  roleId: string;
  parentRoleId: string;
  sellerRate: string;
  parentRate: string;
};

type Draft = { roleId: string; parentRoleId: string; sellerRate: string; parentRate: string };

const shown = (value: string | null) => (value === null ? "" : String(Number(value)));

/**
 * One row per role: its rate for selling alone, and the roles placed under it. Dragging a row onto
 * another places it under that role and asks for the split between seller and broker.
 */
export function CommissionBoard({ roles, links }: { roles: Role[]; links: Link[] }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<Role | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const nameOf = new Map(roles.map((role) => [role.id, role.name]));
  const changed = roles.filter(
    (role) => rates[role.id] !== undefined && rates[role.id] !== shown(role.commissionRate),
  );

  const openDraft = (roleId: string, parentRoleId: string) => {
    const existing = links.find((l) => l.roleId === roleId && l.parentRoleId === parentRoleId);
    setDraft({
      roleId,
      parentRoleId,
      sellerRate: existing ? shown(existing.sellerRate) : "",
      parentRate: existing ? shown(existing.parentRate) : "",
    });
  };

  const run = (
    task: () => Promise<{ success: boolean; error?: { message: string } }>,
    done: string,
  ) =>
    startTransition(async () => {
      const result = await task();
      if (result.success) {
        notify(done, "success");
        router.refresh();
      } else {
        notify(result.error?.message || "Couldn't save.", "error");
      }
    });

  const saveRates = () =>
    startTransition(async () => {
      const saved: string[] = [];
      for (const role of changed) {
        const value = rates[role.id].trim();
        const result = await setRoleCommissionRate({
          id: role.id,
          commissionRate: value === "" ? null : Number(value),
        });
        if (!result.success) {
          notify(`${role.name}: ${result.error.message || "Couldn't save."}`, "error");
          break;
        }
        saved.push(role.id);
      }
      if (!saved.length) return;
      setRates((current) => {
        const next = { ...current };
        for (const id of saved) delete next[id];
        return next;
      });
      if (saved.length === changed.length) notify("Rates saved.", "success");
      router.refresh();
    });

  return (
    <DndContext
      // A fixed id keeps dnd-kit's generated aria ids the same on server and client.
      id="commission-board"
      sensors={sensors}
      onDragStart={({ active }) => setDragging(roles.find((r) => r.id === active.id) ?? null)}
      onDragEnd={({ active, over }) => {
        setDragging(null);
        if (over && over.id !== active.id) openDraft(String(active.id), String(over.id));
      }}
      onDragCancel={() => setDragging(null)}
    >
      <section className="mt-6 overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>Role</span>
          <span>Selling alone</span>
          <span>Roles under it · their split</span>
        </div>
        <ul className="divide-y">
          {roles.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              rate={rates[role.id] ?? shown(role.commissionRate)}
              onRate={(value) => setRates((current) => ({ ...current, [role.id]: value }))}
              childLinks={links.filter((l) => l.parentRoleId === role.id)}
              nameOf={nameOf}
              pending={pending}
              onEdit={(link) => openDraft(link.roleId, link.parentRoleId)}
              onRemove={(link) =>
                run(
                  () => removeCommissionLink({ id: link.id }),
                  `${nameOf.get(link.roleId)} removed from under ${role.name}`,
                )
              }
            />
          ))}
        </ul>
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Drag <GripVertical aria-hidden="true" className="inline size-3.5" /> onto a role to place it
        under it.
      </p>

      {changed.length > 0 && (
        <div
          role="region"
          aria-label="Unsaved rates"
          className="sticky bottom-4 z-20 mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg"
        >
          <p className="text-sm">
            <span className="font-semibold">
              {changed.length} rate{changed.length === 1 ? "" : "s"}
            </span>{" "}
            changed
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setRates({})}
            >
              Discard
            </Button>
            <Button type="button" disabled={pending} onClick={saveRates}>
              {pending ? "Saving…" : "Save all"}
            </Button>
          </div>
        </div>
      )}

      <DragOverlay>
        {dragging && (
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium shadow-lg ring-2 ring-primary/30">
            <GripVertical aria-hidden="true" className="size-3.5 text-muted-foreground" />
            {dragging.name}
          </span>
        )}
      </DragOverlay>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
            <DialogPopup className="w-full max-w-md rounded-lg border bg-card p-5 text-left shadow-xl">
              {draft && (
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const { roleId, parentRoleId } = draft;
                    run(
                      () =>
                        saveCommissionLink({
                          roleId,
                          parentRoleId,
                          sellerRate: Number(draft.sellerRate),
                          parentRate: Number(draft.parentRate),
                        }),
                      `${nameOf.get(roleId)} placed under ${nameOf.get(parentRoleId)}`,
                    );
                    setDraft(null);
                  }}
                >
                  <header className="flex items-start justify-between gap-4">
                    <div>
                      <DialogTitle className="text-lg font-semibold">
                        {nameOf.get(draft.roleId)} under {nameOf.get(draft.parentRoleId)}
                      </DialogTitle>
                      <DialogDescription className="mt-1 text-sm text-muted-foreground">
                        % of the net selling price.
                      </DialogDescription>
                    </div>
                    <DialogClose
                      aria-label="Close"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                    >
                      <X aria-hidden="true" size={16} />
                    </DialogClose>
                  </header>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <RateInput
                      label={nameOf.get(draft.roleId) ?? ""}
                      value={draft.sellerRate}
                      required
                      onChange={(sellerRate) => setDraft({ ...draft, sellerRate })}
                    />
                    <RateInput
                      label={nameOf.get(draft.parentRoleId) ?? ""}
                      value={draft.parentRate}
                      required
                      onChange={(parentRate) => setDraft({ ...draft, parentRate })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <DialogClose className={buttonVariants({ variant: "secondary" })}>
                      Cancel
                    </DialogClose>
                    <Button type="submit" disabled={pending}>
                      Save
                    </Button>
                  </div>
                </form>
              )}
            </DialogPopup>
          </DialogOverlay>
        </DialogPortal>
      </Dialog>
    </DndContext>
  );
}

function RateInput({
  label,
  value,
  required,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="relative">
        <Input
          required={required}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.01}
          placeholder="—"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-7"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </span>
    </label>
  );
}

function RoleRow({
  role,
  rate,
  onRate,
  childLinks,
  nameOf,
  pending,
  onEdit,
  onRemove,
}: {
  role: Role;
  rate: string;
  onRate: (value: string) => void;
  childLinks: Link[];
  nameOf: Map<string, string>;
  pending: boolean;
  onEdit: (link: Link) => void;
  onRemove: (link: Link) => void;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: role.id });
  const { setNodeRef: dropRef, isOver, active } = useDroppable({ id: role.id });
  const target = active !== null && active.id !== role.id;

  return (
    <li
      ref={dropRef}
      className={cn(
        "grid gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)] md:items-center md:gap-4",
        isDragging && "opacity-40",
        target && isOver && "bg-primary/5 ring-2 ring-inset ring-primary/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          ref={dragRef}
          type="button"
          aria-label={`Drag ${role.name} onto another role`}
          className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="truncate font-medium">{role.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {role.members} {role.members === 1 ? "user" : "users"}
        </span>
      </div>

      <div className="max-w-36">
        <span className="relative block">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            placeholder="—"
            aria-label={`${role.name} rate when selling alone`}
            value={rate}
            onChange={(event) => onRate(event.target.value)}
            className="h-9 pr-7"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {childLinks.length ? (
          childLinks.map((link) => (
            <span
              key={link.id}
              className="inline-flex items-center rounded-full border bg-muted/40 text-xs"
            >
              <button
                type="button"
                onClick={() => onEdit(link)}
                aria-label={`Edit ${nameOf.get(link.roleId)} under ${role.name}`}
                className="inline-flex items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <CornerDownRight aria-hidden="true" className="size-3 text-muted-foreground" />
                <span className="font-medium">{nameOf.get(link.roleId)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {shown(link.sellerRate)}% · {shown(link.parentRate)}%
                </span>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(link)}
                aria-label={`Remove ${nameOf.get(link.roleId)} from under ${role.name}`}
                className="inline-flex size-6 items-center justify-center rounded-r-full text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">—</span>
        )}
      </div>
    </li>
  );
}
