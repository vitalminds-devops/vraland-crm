export function dealTitleFor(contactName: string, developmentName: string | null): string {
  const name = contactName.trim() || "Contact";
  return (developmentName ? `${name} — ${developmentName}` : name).slice(0, 220);
}

export type DealLabelInput = {
  developmentName: string | null;
  floorLabel: string | null;
  unitCode: string | null;
  /** The stored title, used only when the deal names no development. */
  title: string;
};

export function dealLabel(deal: DealLabelInput): string {
  if (!deal.developmentName) return deal.title;
  const place = [deal.floorLabel, deal.unitCode].filter(Boolean).join(" · ");
  return place ? `${deal.developmentName} · ${place}` : deal.developmentName;
}
