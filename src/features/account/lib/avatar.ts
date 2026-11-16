/**
 * `users.avatar_url` holds the photo's storage key, not a URL; pages show it through this route.
 * The key's file name changes on every upload, so it doubles as the cache-busting version.
 */
export function avatarSrc(userId: string, storageKey: string | null | undefined) {
  if (!storageKey) return null;
  return `/api/users/${userId}/avatar?v=${encodeURIComponent(storageKey.split("/").pop() ?? "")}`;
}

const avatarTypes: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function avatarMimeType(storageKey: string) {
  return avatarTypes[storageKey.split(".").pop() ?? ""] ?? null;
}
