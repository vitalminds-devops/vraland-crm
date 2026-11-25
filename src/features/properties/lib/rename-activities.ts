/** One "Unit 301 was renamed to 310." activity per renamed unit, as a single rename records. */
export function renameActivities(
  context: { organizationId: string; userId: string },
  propertyId: string,
  renames: readonly { unitId: string; from: string; to: string }[],
) {
  return renames.map((rename) => ({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    activityType: "unit.renamed",
    summary: `Unit ${rename.from} was renamed to ${rename.to}.`,
    propertyId,
    metadata: { unitId: rename.unitId, from: rename.from, to: rename.to },
  }));
}
