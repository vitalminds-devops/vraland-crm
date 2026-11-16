export function floorImageUrl(floor: {
  id: string;
  imageStorageKey: string | null;
}): string | null {
  return floor.imageStorageKey ? `/api/properties/floors/${floor.id}/image` : null;
}

export function unitImageUrl(unit: { id: string; imageStorageKey: string | null }): string | null {
  return unit.imageStorageKey ? `/api/properties/units/${unit.id}/image` : null;
}
