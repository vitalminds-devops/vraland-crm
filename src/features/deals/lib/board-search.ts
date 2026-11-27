/** What a pipeline card can be found by. */
type Searchable = {
  code: string;
  title: string;
  developmentName: string | null;
  propertyTitle: string | null;
  unitCode: string | null;
  unitCodes: string | null;
  parkingCodes?: string | null;
  contactFirstName: string | null;
  contactMiddleName: string | null;
  contactLastName: string | null;
  agentFirstName: string | null;
  agentLastName: string | null;
};

/**
 * Whether a card matches what was typed in its column's search: every word must appear in the
 * opportunity's code, title, contact, development, property, units, parking or agent.
 */
export function matchesBoardSearch(deal: Searchable, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [
    deal.code,
    deal.title,
    deal.developmentName,
    deal.propertyTitle,
    deal.unitCode,
    deal.unitCodes,
    deal.parkingCodes,
    deal.contactFirstName,
    deal.contactMiddleName,
    deal.contactLastName,
    deal.agentFirstName,
    deal.agentLastName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}
