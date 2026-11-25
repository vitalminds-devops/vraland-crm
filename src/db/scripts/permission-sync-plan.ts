/**
 * What syncing the catalog into the permissions table changes: keys to add, keys whose description
 * or group no longer match the catalog, and keys the catalog no longer has (reported, never deleted).
 */
export function permissionSyncPlan(
  existing: readonly { key: string; module: string; description: string | null }[],
  catalog: readonly { key: string; module: string; description: string }[],
) {
  const byKey = new Map(existing.map((row) => [row.key, row]));
  const catalogKeys = new Set(catalog.map((entry) => entry.key));
  return {
    added: catalog.filter((entry) => !byKey.has(entry.key)).map((entry) => entry.key),
    outdated: catalog.filter((entry) => {
      const row = byKey.get(entry.key);
      return (
        row !== undefined && (row.description !== entry.description || row.module !== entry.module)
      );
    }),
    retired: existing.filter((row) => !catalogKeys.has(row.key)).map((row) => row.key),
  };
}
