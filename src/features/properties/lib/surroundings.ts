/** What a designed floor's 3D view shows around the building, picked from the property type. */
export type Surroundings = "city" | "suburb" | "industrial" | "rural";

export function surroundingsFor(propertyType: string | null | undefined): Surroundings {
  switch (propertyType) {
    case "house_and_lot":
    case "townhouse":
      return "suburb";
    case "warehouse":
      return "industrial";
    case "farm":
    case "lot":
      return "rural";
    default:
      return "city";
  }
}
