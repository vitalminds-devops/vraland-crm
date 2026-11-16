/** One user's change to what their roles give: granted adds the permission, false removes it. */
export type PermissionOverride = { key: string; granted: boolean };

/** What the user can do: their roles' permissions with their own changes applied. */
export function applyPermissionOverrides(
  roleKeys: Iterable<string>,
  overrides: readonly PermissionOverride[],
): Set<string> {
  const effective = new Set(roleKeys);
  for (const { key, granted } of overrides) {
    if (granted) effective.add(key);
    else effective.delete(key);
  }
  return effective;
}

/** The changes that turn the roles' permissions into `checked`, sorted so equal sets compare equal. */
export function overridesFor(
  roleKeys: Iterable<string>,
  checked: ReadonlySet<string>,
): PermissionOverride[] {
  const fromRoles = new Set(roleKeys);
  const overrides: PermissionOverride[] = [];
  for (const key of checked) if (!fromRoles.has(key)) overrides.push({ key, granted: true });
  for (const key of fromRoles) if (!checked.has(key)) overrides.push({ key, granted: false });
  return overrides.sort((a, b) => a.key.localeCompare(b.key));
}
