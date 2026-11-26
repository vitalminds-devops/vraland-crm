import type { DealStatus } from "./stage-transitions";

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

const statusLabels: Record<DealStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  cancelled: "Cancelled",
};
const typeLabels: Record<string, string> = { sale: "Sale", rent: "Rent", lease: "Lease" };

/** How an opportunity's status and type read on screen and in exports. */
export const dealStatusLabel = (status: string) => statusLabels[status as DealStatus] ?? status;
export const dealTypeLabel = (type: string) => typeLabels[type] ?? type;
