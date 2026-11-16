export function developmentCoverImageUrl(development: {
  id: string;
  coverImageStorageKey: string | null;
}): string | null {
  return development.coverImageStorageKey ? `/api/developments/${development.id}/cover` : null;
}
