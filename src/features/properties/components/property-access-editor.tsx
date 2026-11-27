"use client";

import { Check, Loader2, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Paginator } from "@/components/ui/paginator";
import { notify } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import {
  clearPropertyGrant,
  grantEveryProperty,
  setPropertyGrant,
} from "../actions/property-access.actions";
import { unitImageUrl } from "../lib/floor-image";
import { fitPlacements, type FloorLayout, type UnitDesign } from "../lib/floor-layout";
import { ParkingPicker } from "./parking-picker";
import { InventoryBrowser } from "./inventory-browser";
import type { UnitGroup } from "../lib/sections";

const PEOPLE_PER_PAGE = 8;

function GrantCount({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "given" | "held";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[12px]",
        tone === "given"
          ? "border-primary/25 bg-primary/5"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "given" ? "text-primary" : "text-destructive",
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

export function PropertyAccessEditor({
  propertyId,
  propertyTitle,
  users,
  grants,
  selectedUserId,
  floors,
  units,
  unitDesigns,
  parkingSlots,
  grant,
  canGrantEveryProperty,
  readOnly = false,
}: {
  propertyId: string;
  propertyTitle: string;
  /** The people this caller may grant to — the same predicate the action checks. */
  users: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }[];
  /** Everyone who already has access to this property, and how much of it. */
  grants: {
    userId: string;
    firstName: string;
    lastName: string;
    isWholeProperty: boolean;
    floorCount: number;
    unitCount: number;
    parkingCount: number;
    heldBackCount: number;
  }[];
  selectedUserId: string | null;
  floors: {
    id: string;
    label: string;
    unitCount: number;
    availableUnits: number;
    hasAccess: boolean;
    /** The designed floor, picked from by clicking its units. */
    layout?: FloorLayout | null;
  }[];
  units: {
    id: string;
    code: string;
    status: string;
    floorId: string;
    imageStorageKey: string | null;
    accessible: boolean;
    group?: UnitGroup | null;
  }[];
  /** Unit type designs by type id, drawn on designed floors. */
  unitDesigns: Record<string, UnitDesign>;
  /** Every parking slot; `accessible` marks the ones the caller may give. */
  parkingSlots: {
    id: string;
    code: string;
    status: string;
    accessible: boolean;
    floorId: string | null;
  }[];
  /** The selected user's grant: `null` means they have **no access**. */
  grant: GrantTargets | null;
  /** Administrators only: a bulk grant is the one write no bounded granter can express. */
  canGrantEveryProperty: boolean;
  /** "See everyone's property access" without granting: the roster only. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const signature = seedSignature(grant);
  const [seed, setSeed] = useState(signature);
  const [scope, setScope] = useState<GrantScope>(seedScope(grant));
  const [floorIds, setFloorIds] = useState<string[]>(grant?.floorIds ?? []);
  const [unitIds, setUnitIds] = useState<string[]>(grant?.unitIds ?? []);
  const [excludedUnitIds, setExcludedUnitIds] = useState<string[]>(grant?.excludedUnitIds ?? []);
  const [parkingSlotIds, setParkingSlotIds] = useState<string[]>(grant?.parkingSlotIds ?? []);
  const [peopleQuery, setPeopleQuery] = useState("");

  if (seed !== signature) {
    setSeed(signature);
    setScope(seedScope(grant));
    setFloorIds(grant?.floorIds ?? []);
    setUnitIds(grant?.unitIds ?? []);
    setExcludedUnitIds(grant?.excludedUnitIds ?? []);
    setParkingSlotIds(grant?.parkingSlotIds ?? []);
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const grantedIds = new Set(grants.map((entry) => entry.userId));

  /** The people rows the search box leaves standing. */
  const peopleSearch = peopleQuery.trim().toLowerCase();
  const visibleGrants = peopleSearch
    ? grants.filter((entry) =>
        `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(peopleSearch),
      )
    : grants;

  /** Which page of the roster is on screen. */
  const [peoplePage, setPeoplePage] = useState(0);
  const peoplePageCount = Math.max(1, Math.ceil(visibleGrants.length / PEOPLE_PER_PAGE));
  const currentPeoplePage = Math.min(peoplePage, peoplePageCount - 1);
  const peopleFirstOnPage = currentPeoplePage * PEOPLE_PER_PAGE;
  const pageGrants = visibleGrants.slice(peopleFirstOnPage, peopleFirstOnPage + PEOPLE_PER_PAGE);

  const selectUser = (userId: string | null) =>
    router.push(
      userId
        ? `/properties/${propertyId}/access?user=${userId}`
        : `/properties/${propertyId}/access`,
      { scroll: false },
    );

  const [activeFloorId, setActiveFloorId] = useState<string | null>(floors[0]?.id ?? null);
  const shownFloorId =
    activeFloorId && floors.some((floor) => floor.id === activeFloorId)
      ? activeFloorId
      : (floors[0]?.id ?? null);

  const building = {
    id: propertyId,
    title: propertyTitle,
    availableUnits: floors.reduce((sum, floor) => sum + floor.availableUnits, 0),
    totalUnits: floors.reduce((sum, floor) => sum + floor.unitCount, 0),
    floors: floors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      availableUnits: floor.availableUnits,
      totalUnits: floor.unitCount,
      hasAccess: floor.hasAccess,
    })),
  };

  const floorOfUnit = new Map(units.map((unit) => [unit.id, unit.floorId] as const));
  const isGranted = (unitId: string) =>
    scope === "everything" ||
    (!excludedUnitIds.includes(unitId) &&
      (unitIds.includes(unitId) || floorIds.includes(floorOfUnit.get(unitId) ?? "")));

  const tick = () => {
    setScope("selected");
  };
  const selectScope = (next: GrantScope) => {
    setScope(next);
    if (next === "everything") {
      setFloorIds([]);
      setUnitIds([]);
      setExcludedUnitIds([]);
      setParkingSlotIds([]);
    }
  };
  const unitsOn = (floorIdsToTest: string[]) =>
    units.filter((unit) => floorIdsToTest.includes(unit.floorId)).map((unit) => unit.id);
  const blockedUnitsOn = (ids: string[]) =>
    units
      .filter(
        (unit) => ids.includes(unit.floorId) && (unit.status !== "available" || !unit.accessible),
      )
      .map((unit) => unit.id);

  const toggleFloor = (floorId: string) => {
    tick();
    const giving = !floorIds.includes(floorId);
    setFloorIds((current) =>
      giving ? [...current, floorId] : current.filter((id) => id !== floorId),
    );
    const affected = new Set(unitsOn([floorId]));
    if (!giving) setUnitIds((current) => current.filter((id) => !affected.has(id)));
    setExcludedUnitIds((current) => [
      ...new Set([
        ...current.filter((id) => !affected.has(id)),
        ...(giving ? blockedUnitsOn([floorId]) : []),
      ]),
    ]);
  };
  const toggleBuilding = () => {
    tick();
    const ids = floors.map((floor) => floor.id);
    const eligible = units.filter(
      (unit) => unit.accessible && (unit.status === "available" || isGranted(unit.id)),
    );
    const giving = !(eligible.length
      ? eligible.every((unit) => isGranted(unit.id))
      : ids.every((id) => floorIds.includes(id)));
    setFloorIds((current) => {
      return giving
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id));
    });
    const affected = new Set(unitsOn(ids));
    if (!giving) setUnitIds((current) => current.filter((id) => !affected.has(id)));
    setExcludedUnitIds((current) => [
      ...new Set([
        ...current.filter((id) => !affected.has(id)),
        ...(giving ? blockedUnitsOn(ids) : []),
      ]),
    ]);
  };
  const setUnitsSelected = (ids: string[], selected: boolean) => {
    if (selected)
      ids = ids.filter((id) =>
        units.some((unit) => unit.id === id && unit.status === "available" && unit.accessible),
      );
    tick();
    const affected = new Set(ids);
    setUnitIds((current) =>
      selected ? [...new Set([...current, ...ids])] : current.filter((id) => !affected.has(id)),
    );
    setExcludedUnitIds((current) => {
      const kept = current.filter((id) => !affected.has(id));
      if (selected) return kept;
      const givenAway = new Set(unitsOn(floorIds));
      return [...new Set([...kept, ...ids.filter((id) => givenAway.has(id))])];
    });
  };
  const toggleParking = (slotId: string) => {
    const slot = parkingSlots.find((item) => item.id === slotId);
    if (
      !slot ||
      (!parkingSlotIds.includes(slotId) && (!slot.accessible || slot.status !== "available"))
    )
      return;
    tick();
    setParkingSlotIds((current) =>
      current.includes(slotId) ? current.filter((id) => id !== slotId) : [...current, slotId],
    );
  };
  const toggleUnit = (unitId: string) => {
    tick();
    const onGivenFloor = floorIds.includes(units.find((unit) => unit.id === unitId)?.floorId ?? "");
    const heldBack = excludedUnitIds.includes(unitId);
    const named = unitIds.includes(unitId);
    const granted = !heldBack && (named || onGivenFloor);
    const unit = units.find((item) => item.id === unitId);
    if (!unit || (!granted && (!unit.accessible || unit.status !== "available"))) return;

    if (granted) {
      setUnitIds((current) => current.filter((id) => id !== unitId));
      setExcludedUnitIds((current) =>
        onGivenFloor ? [...new Set([...current, unitId])] : current.filter((id) => id !== unitId),
      );
      return;
    }

    setExcludedUnitIds((current) => current.filter((id) => id !== unitId));
    if (!onGivenFloor) setUnitIds((current) => [...new Set([...current, unitId])]);
  };

  const run = (
    fn: () => Promise<{ success: boolean; error?: { message: string } }>,
    after?: string,
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        notify(after ?? "Saved.", "success");
        router.refresh();
        return;
      }
      notify(result.error?.message ?? "Couldn't save. Try again.", "error");
    });

  const grantSubmit = (
    <div className="space-y-2">
      <p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12.5px] text-muted-foreground">
        Access:{" "}
        <span className="font-medium text-foreground">
          {selectedUser
            ? accessSummary(scope, floors, floorIds, unitIds, excludedUnitIds, parkingSlotIds)
            : "Choose a person first"}
        </span>
      </p>

      <Button
        type="button"
        variant="primary"
        disabled={!selectedUser || pending}
        onClick={() => {
          if (!selectedUser) return;
          if (
            scope === "selected" &&
            !floorIds.length &&
            !unitIds.length &&
            !parkingSlotIds.length
          ) {
            run(() => clearPropertyGrant({ propertyId, userId: selectedUser.id }));
            return;
          }
          run(() =>
            setPropertyGrant({
              propertyId,
              userId: selectedUser.id,
              floorIds: scope === "selected" ? floorIds : [],
              unitIds: scope === "selected" ? unitIds : [],
              excludedUnitIds: scope === "selected" ? excludedUnitIds : [],
              parkingSlotIds: scope === "selected" ? parkingSlotIds : [],
            }),
          );
        }}
        className="w-full gap-2"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Check aria-hidden="true" className="size-4" />
        )}
        {grant ? "Save access" : "Give access"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* One card, two columns. It was two cards in a grid, which left a
          shortcut: the roster ends after five rows and the panel runs another
          100px, so either the bottoms jag or the shorter card is stretched and
          carries a block of empty space inside its own border. A single card
          with a divider down the middle cannot do either — there is one bottom
          edge, and the space under a list that has ended is just the card. */}
      <section
        className={cn(
          "overflow-hidden rounded-xl border border-border/60 bg-card",
          !readOnly && "lg:grid lg:grid-cols-[minmax(0,1fr)_21rem]",
        )}
      >
        {/* The roster: the state of the property. */}
        <div
          className={cn(
            "min-w-0",
            !readOnly && "border-b border-border/60 lg:border-r lg:border-b-0",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2.5">
            <h2 className="text-[14px] font-semibold">People with access</h2>
            <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
              {readOnly && "View only · "}
              {grants.length} {grants.length === 1 ? "person" : "people"}
            </span>
          </div>

          <div className="border-b border-border/40 p-2">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={peopleQuery}
                onChange={(event) => {
                  setPeopleQuery(event.target.value);
                  setPeoplePage(0);
                }}
                placeholder="Search people"
                aria-label="Search people with access"
                className="h-8 w-full rounded-lg border border-border/60 bg-background pr-2.5 pl-8 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/25"
              />
            </label>
          </div>

          {!grants.length ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
              No one has access yet.
            </p>
          ) : !visibleGrants.length ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">No matches.</p>
          ) : (
            <ul
              aria-label="People with access"
              tabIndex={0}
              className="max-h-80 divide-y divide-border/40 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-primary"
            >
              {pageGrants.map((entry) => (
                <li
                  key={entry.userId}
                  className={cn(
                    "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-1.5 transition-colors",
                    entry.userId === selectedUserId && "bg-primary/5",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-content-center rounded-full bg-primary/10 text-[10px] font-semibold tracking-wide text-primary"
                  >
                    {initials(entry)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight font-medium">
                      {entry.firstName} {entry.lastName}
                    </span>
                    <span className="block truncate text-[11.5px] leading-tight text-muted-foreground">
                      {entry.isWholeProperty
                        ? "Whole property"
                        : describeTargets(entry, undefined, entry.parkingCount)}
                      {!entry.isWholeProperty && entry.heldBackCount
                        ? `, ${entry.heldBackCount} held back`
                        : ""}
                    </span>
                  </span>
                  {!readOnly && (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() => selectUser(entry.userId)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          run(
                            () =>
                              clearPropertyGrant({
                                propertyId,
                                userId: entry.userId,
                              }),
                            "Access removed.",
                          )
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <Paginator
            page={currentPeoplePage}
            pageCount={peoplePageCount}
            onPageChange={setPeoplePage}
            total={visibleGrants.length}
            perPage={PEOPLE_PER_PAGE}
            noun="people"
            disabled={pending}
          />
        </div>

        {!readOnly && (
          <div className="p-4">
            <h2 className="text-[14px] font-semibold">Give access</h2>

            {!users.length ? (
              <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
                No one you can give access to.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <label className="grid gap-1">
                  <span className="text-[12.5px] font-medium text-foreground">Person</span>
                  <NativeSelect
                    id="grant-user"
                    value={selectedUserId ?? ""}
                    onChange={(event) => selectUser(event.target.value || null)}
                    className="h-8 w-full rounded-lg border border-border/60 bg-background px-2.5 pr-8 text-[13px]"
                  >
                    <NativeSelectOption value="">Choose a person</NativeSelectOption>
                    {users.map((user) => (
                      <NativeSelectOption key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                        {grantedIds.has(user.id) ? " · has access" : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>

                <div>
                  <p className="mb-1.5 text-[12.5px] font-medium text-foreground">
                    What can they see?
                  </p>
                  <div role="radiogroup" aria-label="What they may see" className="grid gap-2">
                    {grantScopes.map((option) => {
                      const active = scope === option;
                      const { label, detail } = grantScopeOptions[option];
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!selectedUser || pending}
                          onClick={() => selectScope(option)}
                          className={cn(
                            "rounded-lg border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            active
                              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                              : "border-primary/30 bg-primary/5 hover:border-primary/70 hover:bg-primary/10",
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "grid size-4 shrink-0 place-content-center rounded-full border bg-background transition-colors",
                                active ? "border-primary" : "border-primary/50",
                              )}
                            >
                              {active && <span className="size-2 rounded-full bg-primary" />}
                            </span>
                            <span className="text-[13px] font-semibold">{label}</span>
                          </span>
                          <span className="mt-1 block pl-[1.625rem] text-[12px] leading-snug text-muted-foreground">
                            {detail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedUser && canGrantEveryProperty && (
                  <div className="border-t border-border/60 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => grantEveryProperty({ userId: selectedUser.id }),
                          `Every property given to ${selectedUser.firstName}.`,
                        )
                      }
                      className="gap-1.5"
                    >
                      <Users aria-hidden="true" className="size-3.5" />
                      Give every property
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {selectedUser && (
        <Panel
          title={`What ${selectedUser.firstName} may see`}
          flush
          actions={
            scope === "everything" ? (
              <span className="text-[12px] text-muted-foreground">Whole property</span>
            ) : floorIds.length ||
              unitIds.length ||
              excludedUnitIds.length ||
              parkingSlotIds.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <GrantCount
                  value={floorIds.length}
                  label={floorIds.length === 1 ? "floor" : "floors"}
                  tone="given"
                />
                <span aria-hidden="true" className="text-muted-foreground/40">
                  ·
                </span>
                <GrantCount
                  value={unitIds.length}
                  label={unitIds.length === 1 ? "unit" : "units"}
                  tone="given"
                />
                {parkingSlotIds.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground/40">
                      ·
                    </span>
                    <GrantCount value={parkingSlotIds.length} label="parking" tone="given" />
                  </>
                )}
                {excludedUnitIds.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground/40">
                      ·
                    </span>
                    <GrantCount value={excludedUnitIds.length} label="held back" tone="held" />
                  </>
                )}
              </div>
            ) : (
              <span className="text-[12px] text-muted-foreground">Nothing given yet</span>
            )
          }
        >
          {floors.length ? (
            <div className={scope === "selected" ? undefined : "p-4"}>
              {scope === "selected" ? (
                <InventoryBrowser
                  buildings={[building]}
                  units={units.map((unit) => ({
                    id: unit.id,
                    code: unit.code,
                    status: unit.status,
                    floorId: unit.floorId,
                    imageUrl: unitImageUrl(unit),
                    photoCount: unit.imageStorageKey ? 1 : 0,
                    accessible: unit.accessible,
                    group: unit.group,
                  }))}
                  floorLayouts={Object.fromEntries(
                    floors.flatMap((floor) =>
                      floor.layout ? [[floor.id, fitPlacements(floor.layout, unitDesigns)]] : [],
                    ),
                  )}
                  designs={unitDesigns}
                  activeFloorId={shownFloorId}
                  onActiveFloorChange={setActiveFloorId}
                  selectedFloorIds={floorIds}
                  selectedUnitIds={unitIds}
                  excludedUnitIds={excludedUnitIds}
                  onToggleUnit={toggleUnit}
                  onToggleFloor={toggleFloor}
                  onToggleBuilding={toggleBuilding}
                  onSetUnitsSelected={setUnitsSelected}
                  disabled={pending}
                  emptyLabel="No units yet."
                />
              ) : (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  Every floor and unit, including new ones.
                </p>
              )}
            </div>
          ) : (
            <p className="p-4 text-center text-[13px] text-muted-foreground">No floors yet.</p>
          )}

          {/* Parking is picked with its floor, like the units on it; slots on no floor last. */}
          {scope === "selected" &&
            [
              parkingSlots.filter((slot) => shownFloorId && slot.floorId === shownFloorId),
              parkingSlots.filter((slot) => !slot.floorId),
            ].map(
              (slots, index) =>
                slots.length > 0 && (
                  <div key={index} className="border-t border-border/60 p-4">
                    {index === 1 && (
                      <p className="mb-2 text-[12.5px] text-muted-foreground">
                        Parking without a floor
                      </p>
                    )}
                    <ParkingPicker
                      slots={slots}
                      selectedIds={parkingSlotIds}
                      onToggle={toggleParking}
                      disabled={pending}
                    />
                  </div>
                ),
            )}
        </Panel>
      )}
      {selectedUser && (
        <div className="sticky bottom-0 z-20 rounded-xl border border-border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_#0000000a] backdrop-blur">
          {grantSubmit}
        </div>
      )}
    </div>
  );
}

/** The two shapes access can take. */
const grantScopes = ["everything", "selected"] as const;
type GrantScope = (typeof grantScopes)[number];

const grantScopeOptions: Record<GrantScope, { label: string; detail: string }> = {
  everything: {
    label: "The whole property",
    detail: "Every floor and unit, including new ones.",
  },
  selected: {
    label: "Only some floors and units",
    detail: "They won’t see anything else.",
  },
};

function accessSummary(
  scope: GrantScope,
  floors: { id: string; label: string }[],
  floorIds: string[],
  unitIds: string[],
  excludedUnitIds: string[],
  parkingSlotIds: string[],
): string {
  if (scope === "everything") return "Whole property";
  if (!floorIds.length && !unitIds.length && !parkingSlotIds.length) return "Nothing yet";
  const granted = describeTargets(
    { floorCount: floorIds.length, unitCount: unitIds.length },
    floors.filter((floor) => floorIds.includes(floor.id)),
    parkingSlotIds.length,
  );
  if (!excludedUnitIds.length) return granted;
  const held = excludedUnitIds.length;
  return `${granted}, less ${held} ${held === 1 ? "unit" : "units"} held back`;
}

/** "AS" from Ana Santos: the two letters on the avatar. */
function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}

type GrantTargets = {
  floorIds: string[];
  unitIds: string[];
  excludedUnitIds: string[];
  parkingSlotIds: string[];
};

function seedScope(grant: GrantTargets | null) {
  if (!grant) return "everything" as const;
  return grant.floorIds.length || grant.unitIds.length || grant.parkingSlotIds.length
    ? ("selected" as const)
    : ("everything" as const);
}

function seedSignature(grant: GrantTargets | null) {
  if (!grant) return "none";
  return `g:${grant.floorIds.join(",")}|u:${grant.unitIds.join(",")}|x:${grant.excludedUnitIds.join(",")}|p:${grant.parkingSlotIds.join(",")}`;
}

function describeTargets(
  counts: { floorCount: number; unitCount: number },
  floors: { label: string }[] | undefined,
  parkingCount = 0,
): string {
  const floorPart = describeFloors(counts.floorCount, floors);
  const parts = [
    floorPart,
    counts.unitCount ? `${counts.unitCount} ${counts.unitCount === 1 ? "unit" : "units"}` : "",
    parkingCount ? `${parkingCount} parking` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" and ") : "nothing";
}

function describeFloors(count: number, floors: { label: string }[] | undefined): string {
  if (!count) return "";
  if (floors && floors.length === count) {
    const labels = floors.map((floor) => floor.label);
    if (labels.length > 3) return `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return labels.join(", ");
  }
  return `${count} ${count === 1 ? "floor" : "floors"}`;
}
