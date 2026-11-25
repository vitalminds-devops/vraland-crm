import { revalidatePath } from "next/cache";

/** A property's inventory shows on its page and its Design page, so both refresh together. */
export function revalidateProperty(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/design/${propertyId}`);
}
