/** One open deal of a contact that has more than one, with what hangs off it. */
export type DuplicateDealCandidate = {
  id: string;
  dealCode: string;
  createdAt: Date;
  stageChanges: number;
  agents: number;
  /** Bills, offers and tasks: anything that would be lost or orphaned by removing the deal. */
  attachments: number;
  /** Opened on purpose with "Add opportunity" (e.g. a unit in another development): never a duplicate. */
  intentional?: boolean;
};

/**
 * Keeps the deal people actually worked on (most stage changes and agents, oldest on a tie)
 * and marks the rest removable only when nothing is attached to them.
 */
export function planDuplicateDeals(candidates: DuplicateDealCandidate[]) {
  const ranked = candidates
    .filter((deal) => !deal.intentional)
    .sort(
      (a, b) =>
        b.stageChanges + b.agents - (a.stageChanges + a.agents) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const [keep, ...rest] = ranked;
  return {
    keep,
    remove: rest.filter((deal) => deal.attachments === 0),
    blocked: rest.filter((deal) => deal.attachments > 0),
  };
}
